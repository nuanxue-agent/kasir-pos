/**
 * @module audit-query
 * Shared table-init helper used by API routes so they don't import
 * the full audit.ts module (which also pulls in logAudit etc.).
 */
import { exec } from '@/lib/db'

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

export async function ensureAuditTable(): Promise<void> {
  if (tableEnsured) return
  await exec(CREATE_TABLE_SQL, [])
  tableEnsured = true
}
