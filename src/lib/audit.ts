import { exec, query, newId, nowISO } from '@/lib/db'

// ─── Schema ───────────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS AuditLog (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    userId      TEXT NOT NULL,
    action      TEXT NOT NULL,
    resourceType TEXT,
    resourceId  TEXT,
    meta        TEXT,
    createdAt   TEXT NOT NULL
  )
`

let tableEnsured = false

async function ensureTable(): Promise<void> {
  if (tableEnsured) return
  await exec(CREATE_TABLE_SQL, [])
  tableEnsured = true
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'ORDER_CREATE'
  | 'ORDER_REFUND'
  | 'ORDER_VOID'
  | 'STOCK_ADJUST'
  | 'PRODUCT_CREATE'
  | 'PRODUCT_UPDATE'
  | 'PRODUCT_DELETE'
  | 'CUSTOMER_CREATE'
  | 'CUSTOMER_UPDATE'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'STORE_UPDATE'
  | 'SHIFT_OPEN'
  | 'SHIFT_CLOSE'
  | string

export interface LogAuditParams {
  storeId: string
  userId: string
  action: AuditAction
  resourceType?: string
  resourceId?: string
  meta?: Record<string, unknown>
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  await ensureTable()
  const id = newId()
  const t = nowISO()
  await exec(
    `INSERT INTO AuditLog (id, storeId, userId, action, resourceType, resourceId, meta, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.storeId,
      params.userId,
      params.action,
      params.resourceType ?? null,
      params.resourceId ?? null,
      params.meta ? JSON.stringify(params.meta) : null,
      t,
    ],
  )
}

// ─── Query helpers ────────────────────────────────────────────────────────────

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

export async function getAuditLogs(params: {
  storeId: string
  page?: number
  pageSize?: number
  action?: string
}): Promise<{ entries: AuditLogEntry[]; total: number; pages: number }> {
  await ensureTable()
  const { storeId, page = 1, pageSize = 20, action } = params
  const offset = (page - 1) * pageSize

  const whereClauses = ['al.storeId = ?']
  const whereParams: unknown[] = [storeId]
  if (action) {
    whereClauses.push('al.action = ?')
    whereParams.push(action)
  }
  const where = whereClauses.join(' AND ')

  const countRows = await query<{ total: number }>(
    `SELECT COUNT(*) as total FROM AuditLog al WHERE ${where}`,
    whereParams,
  )
  const total = countRows[0]?.total ?? 0
  const pages = Math.ceil(total / pageSize) || 1

  const rows = await query<any>(
    `SELECT al.*, u.name as userName
     FROM AuditLog al
     LEFT JOIN User u ON al.userId = u.id
     WHERE ${where}
     ORDER BY al.createdAt DESC
     LIMIT ? OFFSET ?`,
    [...whereParams, pageSize, offset],
  )

  const entries: AuditLogEntry[] = rows.map((r: any) => ({
    ...r,
    meta: r.meta
      ? (() => {
          try {
            return JSON.parse(r.meta)
          } catch {
            return null
          }
        })()
      : null,
  }))

  return { entries, total, pages }
}
