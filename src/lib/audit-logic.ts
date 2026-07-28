/**
 * @module audit-logic
 * Pure functions for audit log processing — no DB deps so they're easily testable.
 */

// AuditLogEntry is defined inline here to avoid circular dependency with audit.ts
export interface AuditLogEntry {
  id: string
  storeId: string
  userId: string
  userName?: string
  action: string
  resourceType: string | null
  resourceId: string | null
  meta: Record<string, unknown> | null
  createdAt: string
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditFilter {
  userId?: string
  action?: string
  resourceType?: string
  from?: string   // ISO date string
  to?: string     // ISO date string
}

export interface HeatmapCell {
  userId: string
  userName: string
  date: string       // YYYY-MM-DD
  count: number
}

export interface SuspiciousFlag {
  type: 'EXCESSIVE_DELETES' | 'BULK_ACTION' | 'NEW_IP_LOGIN'
  userId: string
  userName: string
  date: string
  count: number
  description: string
}

// ─── Filtering ────────────────────────────────────────────────────────────────

/**
 * Apply in-memory filters to a list of audit entries.
 * Used by tests; the API applies filters at the SQL layer for performance.
 */
export function filterEntries(
  entries: AuditLogEntry[],
  filter: AuditFilter,
): AuditLogEntry[] {
  return entries.filter(e => {
    if (filter.userId && e.userId !== filter.userId) return false
    if (filter.action && e.action !== filter.action) return false
    if (filter.resourceType && e.resourceType !== filter.resourceType) return false
    if (filter.from && e.createdAt < filter.from) return false
    if (filter.to) {
      // treat `to` as end-of-day: add one day
      const toEnd = filter.to + 'T23:59:59.999Z'
      if (e.createdAt > toEnd) return false
    }
    return true
  })
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pages: number
  pageSize: number
}

export function paginateEntries(
  entries: AuditLogEntry[],
  page: number,
  pageSize: number,
): PaginatedResult<AuditLogEntry> {
  const total = entries.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.max(1, Math.min(page, pages))
  const offset = (safePage - 1) * pageSize
  return {
    items: entries.slice(offset, offset + pageSize),
    total,
    page: safePage,
    pages,
    pageSize,
  }
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

/**
 * Build a per-user-per-day action count heatmap from a list of entries.
 */
export function buildHeatmap(entries: AuditLogEntry[]): HeatmapCell[] {
  const map = new Map<string, HeatmapCell>()

  for (const e of entries) {
    const date = e.createdAt.slice(0, 10)
    const key = `${e.userId}::${date}`
    const existing = map.get(key)
    if (existing) {
      existing.count++
    } else {
      map.set(key, {
        userId: e.userId,
        userName: e.userName ?? e.userId,
        date,
        count: 1,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.userId.localeCompare(b.userId)
  })
}

// ─── Suspicious activity detection ───────────────────────────────────────────

const DELETE_ACTIONS = new Set([
  'PRODUCT_DELETE',
  'ORDER_VOID',
  'ORDER_REFUND',
])

const EXCESSIVE_DELETE_THRESHOLD = 51
const BULK_ACTION_THRESHOLD = 100

/**
 * Detect suspicious activity patterns in an audit log.
 *
 * Rules:
 *  1. >50 delete-type actions by one user in a single day
 *  2. >100 total actions by one user in a single day (bulk/scripted)
 *  3. LOGIN action with meta.newIp = true (stub for new-IP detection)
 */
export function detectSuspiciousActivity(entries: AuditLogEntry[]): SuspiciousFlag[] {
  // Group by userId + date
  const deletesByUserDay = new Map<string, { userId: string; userName: string; date: string; count: number }>()
  const totalsByUserDay = new Map<string, { userId: string; userName: string; date: string; count: number }>()
  const newIpLogins: SuspiciousFlag[] = []

  for (const e of entries) {
    const date = e.createdAt.slice(0, 10)
    const key = `${e.userId}::${date}`
    const name = e.userName ?? e.userId

    // Total actions
    const totals = totalsByUserDay.get(key)
    if (totals) {
      totals.count++
    } else {
      totalsByUserDay.set(key, { userId: e.userId, userName: name, date, count: 1 })
    }

    // Delete actions
    if (DELETE_ACTIONS.has(e.action)) {
      const deletes = deletesByUserDay.get(key)
      if (deletes) {
        deletes.count++
      } else {
        deletesByUserDay.set(key, { userId: e.userId, userName: name, date, count: 1 })
      }
    }

    // New IP login stub
    if (e.action === 'LOGIN' && (e.meta as any)?.newIp === true) {
      newIpLogins.push({
        type: 'NEW_IP_LOGIN',
        userId: e.userId,
        userName: name,
        date,
        count: 1,
        description: `Login dari IP baru terdeteksi untuk ${name} pada ${date}.`,
      })
    }
  }

  const flags: SuspiciousFlag[] = []

  for (const cell of Array.from(deletesByUserDay.values())) {
    if (cell.count >= EXCESSIVE_DELETE_THRESHOLD) {
      flags.push({
        type: 'EXCESSIVE_DELETES',
        userId: cell.userId,
        userName: cell.userName,
        date: cell.date,
        count: cell.count,
        description: `${cell.userName} melakukan ${cell.count} aksi hapus/void pada ${cell.date} (batas: ${EXCESSIVE_DELETE_THRESHOLD}).`,
      })
    }
  }

  for (const cell of Array.from(totalsByUserDay.values())) {
    if (cell.count >= BULK_ACTION_THRESHOLD) {
      flags.push({
        type: 'BULK_ACTION',
        userId: cell.userId,
        userName: cell.userName,
        date: cell.date,
        count: cell.count,
        description: `${cell.userName} melakukan ${cell.count} aksi pada ${cell.date} — kemungkinan aktivitas massal.`,
      })
    }
  }

  flags.push(...newIpLogins)

  return flags.sort((a, b) => b.date.localeCompare(a.date))
}

// ─── CSV export ───────────────────────────────────────────────────────────────

const CSV_HEADERS = ['ID', 'Tanggal', 'Pengguna', 'Aksi', 'Tipe Sumber Daya', 'ID Sumber Daya', 'Meta']

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Convert a list of audit entries to a CSV string.
 */
export function entriesToCsv(entries: AuditLogEntry[]): string {
  const rows = [CSV_HEADERS.join(',')]
  for (const e of entries) {
    rows.push([
      escapeCsv(e.id),
      escapeCsv(e.createdAt),
      escapeCsv(e.userName ?? e.userId),
      escapeCsv(e.action),
      escapeCsv(e.resourceType),
      escapeCsv(e.resourceId),
      escapeCsv(e.meta ? JSON.stringify(e.meta) : null),
    ].join(','))
  }
  return rows.join('\n')
}

// ─── Action label helpers ─────────────────────────────────────────────────────

export const ACTION_LABELS: Record<string, string> = {
  LOGIN:           'Login',
  LOGOUT:          'Logout',
  ORDER_CREATE:    'Buat Pesanan',
  ORDER_REFUND:    'Refund Pesanan',
  ORDER_VOID:      'Batalkan Pesanan',
  STOCK_ADJUST:    'Sesuaikan Stok',
  PRODUCT_CREATE:  'Buat Produk',
  PRODUCT_UPDATE:  'Update Produk',
  PRODUCT_DELETE:  'Hapus Produk',
  CUSTOMER_CREATE: 'Buat Pelanggan',
  CUSTOMER_UPDATE: 'Update Pelanggan',
  USER_CREATE:     'Buat Pengguna',
  USER_UPDATE:     'Update Pengguna',
  STORE_UPDATE:    'Update Toko',
  SHIFT_OPEN:      'Buka Shift',
  SHIFT_CLOSE:     'Tutup Shift',
}

export function labelForAction(action: string): string {
  return ACTION_LABELS[action] ?? action
}

export const ALL_AUDIT_ACTIONS = Object.keys(ACTION_LABELS)
