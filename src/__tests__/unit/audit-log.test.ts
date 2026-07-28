import { describe, it, expect } from 'vitest'
import {
  filterEntries,
  paginateEntries,
  buildHeatmap,
  detectSuspiciousActivity,
  entriesToCsv,
  type AuditLogEntry,
} from '@/lib/audit-logic'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  const base: AuditLogEntry = {
    id:           'entry-1',
    storeId:      'store-1',
    userId:       'user-1',
    userName:     'Budi Santoso',
    action:       'ORDER_CREATE',
    resourceType: 'Order',
    resourceId:   'order-1',
    meta:         null,
    createdAt:    '2024-03-15T10:00:00.000Z',
  }
  // Apply overrides — explicit null must win, so spread after base
  return { ...base, ...overrides }
}

function makeEntries(count: number, overrides: Partial<AuditLogEntry> = {}): AuditLogEntry[] {
  return Array.from({ length: count }, (_, i) =>
    makeEntry({ ...overrides, id: `entry-${i + 1}` }),
  )
}

// ─── 1. Audit entry creation ──────────────────────────────────────────────────

describe('AuditLogEntry shape', () => {
  it('creates a well-formed audit entry with all required fields', () => {
    const entry = makeEntry()
    expect(entry.id).toBe('entry-1')
    expect(entry.storeId).toBe('store-1')
    expect(entry.userId).toBe('user-1')
    expect(entry.action).toBe('ORDER_CREATE')
    expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('allows optional fields to be null', () => {
    const entry = makeEntry({ resourceType: null, resourceId: null, meta: null })
    expect(entry.resourceType).toBeNull()
    expect(entry.resourceId).toBeNull()
    expect(entry.meta).toBeNull()
  })

  it('allows meta to carry arbitrary JSON data', () => {
    const entry = makeEntry({ meta: { amount: 50_000, note: 'diskon' } })
    expect((entry.meta as any)?.amount).toBe(50_000)
  })
})

// ─── 2. Filter by action type ─────────────────────────────────────────────────

describe('filterEntries — action type', () => {
  const entries: AuditLogEntry[] = [
    makeEntry({ id: 'e1', action: 'ORDER_CREATE' }),
    makeEntry({ id: 'e2', action: 'PRODUCT_DELETE' }),
    makeEntry({ id: 'e3', action: 'ORDER_CREATE' }),
    makeEntry({ id: 'e4', action: 'USER_UPDATE' }),
  ]

  it('returns only entries matching the specified action', () => {
    const result = filterEntries(entries, { action: 'ORDER_CREATE' })
    expect(result).toHaveLength(2)
    expect(result.every(e => e.action === 'ORDER_CREATE')).toBe(true)
  })

  it('returns all entries when no action filter is given', () => {
    expect(filterEntries(entries, {})).toHaveLength(4)
  })

  it('returns empty array when action has no matches', () => {
    expect(filterEntries(entries, { action: 'STOCK_ADJUST' })).toHaveLength(0)
  })
})

// ─── 3. Filter by date range ──────────────────────────────────────────────────

describe('filterEntries — date range', () => {
  const entries: AuditLogEntry[] = [
    makeEntry({ id: 'e1', createdAt: '2024-01-05T10:00:00.000Z' }),
    makeEntry({ id: 'e2', createdAt: '2024-01-10T10:00:00.000Z' }),
    makeEntry({ id: 'e3', createdAt: '2024-01-20T10:00:00.000Z' }),
  ]

  it('filters entries on or after `from` date', () => {
    const result = filterEntries(entries, { from: '2024-01-10' })
    expect(result).toHaveLength(2)
    expect(result.map(e => e.id)).toEqual(['e2', 'e3'])
  })

  it('filters entries on or before `to` date', () => {
    const result = filterEntries(entries, { to: '2024-01-10' })
    expect(result).toHaveLength(2)
    expect(result.map(e => e.id)).toEqual(['e1', 'e2'])
  })

  it('combines from and to for a bounded window', () => {
    const result = filterEntries(entries, { from: '2024-01-10', to: '2024-01-10' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('e2')
  })
})

// ─── 4. Suspicious activity — excessive deletes ───────────────────────────────

describe('detectSuspiciousActivity — excessive deletes', () => {
  it('flags a user with >50 delete-type actions in one day', () => {
    const entries: AuditLogEntry[] = Array.from({ length: 55 }, (_, i) =>
      makeEntry({
        id:        `del-${i}`,
        action:    'PRODUCT_DELETE',
        createdAt: '2024-03-15T10:00:00.000Z',
        userId:    'user-bad',
        userName:  'Hacker Joe',
      }),
    )
    const flags = detectSuspiciousActivity(entries)
    const deleteFlag = flags.find(f => f.type === 'EXCESSIVE_DELETES')
    expect(deleteFlag).toBeDefined()
    expect(deleteFlag!.userId).toBe('user-bad')
    expect(deleteFlag!.count).toBe(55)
  })

  it('does not flag a user with exactly 50 delete actions', () => {
    const entries: AuditLogEntry[] = Array.from({ length: 50 }, (_, i) =>
      makeEntry({
        id:        `del-${i}`,
        action:    'PRODUCT_DELETE',
        createdAt: '2024-03-15T10:00:00.000Z',
      }),
    )
    const flags = detectSuspiciousActivity(entries)
    expect(flags.filter(f => f.type === 'EXCESSIVE_DELETES')).toHaveLength(0)
  })

  it('counts ORDER_VOID as a delete-type action', () => {
    const entries = Array.from({ length: 55 }, (_, i) =>
      makeEntry({ id: `void-${i}`, action: 'ORDER_VOID', createdAt: '2024-03-15T10:00:00.000Z' }),
    )
    const flags = detectSuspiciousActivity(entries)
    expect(flags.some(f => f.type === 'EXCESSIVE_DELETES')).toBe(true)
  })

  it('counts ORDER_REFUND as a delete-type action', () => {
    const entries = Array.from({ length: 55 }, (_, i) =>
      makeEntry({ id: `ref-${i}`, action: 'ORDER_REFUND', createdAt: '2024-03-15T10:00:00.000Z' }),
    )
    const flags = detectSuspiciousActivity(entries)
    expect(flags.some(f => f.type === 'EXCESSIVE_DELETES')).toBe(true)
  })
})

// ─── 5. Export format validation ──────────────────────────────────────────────

describe('entriesToCsv', () => {
  it('produces a CSV string with a header row', () => {
    const csv = entriesToCsv([])
    const header = csv.split('\n')[0]
    expect(header).toContain('ID')
    expect(header).toContain('Tanggal')
    expect(header).toContain('Pengguna')
    expect(header).toContain('Aksi')
  })

  it('includes one data row per entry', () => {
    const entries = makeEntries(3)
    const lines = entriesToCsv(entries).split('\n')
    // header + 3 data rows
    expect(lines).toHaveLength(4)
  })

  it('escapes commas inside field values', () => {
    const entry = makeEntry({ userName: 'Doe, John' })
    const csv = entriesToCsv([entry])
    // The field must be quoted when it contains a comma
    expect(csv).toContain('"Doe, John"')
  })

  it('escapes double-quotes inside field values', () => {
    const entry = makeEntry({ userName: 'He said "hello"' })
    const csv = entriesToCsv([entry])
    expect(csv).toContain('"He said ""hello"""')
  })
})

// ─── 6. Pagination logic ──────────────────────────────────────────────────────

describe('paginateEntries', () => {
  it('returns the correct page slice', () => {
    const entries = makeEntries(25)
    const result = paginateEntries(entries, 2, 10)
    expect(result.items).toHaveLength(10)
    expect(result.items[0].id).toBe('entry-11')
    expect(result.page).toBe(2)
    expect(result.pages).toBe(3)
    expect(result.total).toBe(25)
  })

  it('clamps page to valid range', () => {
    const entries = makeEntries(5)
    const overPage = paginateEntries(entries, 99, 10)
    expect(overPage.page).toBe(1)
    const underPage = paginateEntries(entries, -1, 10)
    expect(underPage.page).toBe(1)
  })

  it('returns all items on page 1 when count < pageSize', () => {
    const entries = makeEntries(3)
    const result = paginateEntries(entries, 1, 20)
    expect(result.items).toHaveLength(3)
    expect(result.pages).toBe(1)
  })

  it('returns empty items array for empty input', () => {
    const result = paginateEntries([], 1, 20)
    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(result.pages).toBe(1)
  })
})

// ─── 7. Heatmap generation ────────────────────────────────────────────────────

describe('buildHeatmap', () => {
  it('aggregates actions per user per day', () => {
    const entries: AuditLogEntry[] = [
      makeEntry({ userId: 'u1', createdAt: '2024-03-15T08:00:00.000Z' }),
      makeEntry({ userId: 'u1', createdAt: '2024-03-15T09:00:00.000Z' }),
      makeEntry({ userId: 'u1', createdAt: '2024-03-16T10:00:00.000Z' }),
      makeEntry({ userId: 'u2', createdAt: '2024-03-15T10:00:00.000Z' }),
    ]
    const heatmap = buildHeatmap(entries)
    const u1Mar15 = heatmap.find(c => c.userId === 'u1' && c.date === '2024-03-15')
    expect(u1Mar15?.count).toBe(2)
    const u1Mar16 = heatmap.find(c => c.userId === 'u1' && c.date === '2024-03-16')
    expect(u1Mar16?.count).toBe(1)
    const u2Mar15 = heatmap.find(c => c.userId === 'u2' && c.date === '2024-03-15')
    expect(u2Mar15?.count).toBe(1)
  })

  it('returns empty array for empty input', () => {
    expect(buildHeatmap([])).toHaveLength(0)
  })
})
