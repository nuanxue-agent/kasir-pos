/**
 * src/lib — barrel export
 * Import shared utilities from here instead of reaching into individual modules.
 */

// ── Database ──────────────────────────────────────────────────────────────────
export { exec, query, queryOne, batchExec, newId, nowISO } from './db'

// ── Auth ──────────────────────────────────────────────────────────────────────
export {
  createSession,
  getSession,
  getSessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
  auth,
} from './auth'
export type { SessionUser, Session } from './auth'

// ── Currency ──────────────────────────────────────────────────────────────────
export * from './currency'

// ── Utils ─────────────────────────────────────────────────────────────────────
export * from './utils'

// ── Permissions ───────────────────────────────────────────────────────────────
export * from './permissions'

// ── Audit ─────────────────────────────────────────────────────────────────────
export { logAudit, getAuditLogs } from './audit'
export type { AuditAction, LogAuditParams, AuditLogEntry } from './audit'
