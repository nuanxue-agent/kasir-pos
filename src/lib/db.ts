// Lightweight D1 wrapper — replaces Prisma entirely
// Works in edge runtime, zero bundle overhead

export type DB = D1Database

declare global {
  // Injected by Cloudflare Pages via binding
  // eslint-disable-next-line no-var
  var __db: D1Database | undefined
}

// Get D1 binding — from CF env (prod) or global mock (dev)
export function getDB(env?: { DB?: D1Database }): D1Database {
  const db = env?.DB ?? (globalThis as any).__db
  if (!db) throw new Error('D1 database binding not found. Ensure DB binding is configured.')
  return db
}

// Helper: run a query returning many rows
export async function query<T = Record<string, any>>(
  db: D1Database,
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const stmt = db.prepare(sql)
  const result = params.length ? await stmt.bind(...params).all<T>() : await stmt.all<T>()
  return result.results ?? []
}

// Helper: run a query returning one row
export async function queryOne<T = Record<string, any>>(
  db: D1Database,
  sql: string,
  params: any[] = []
): Promise<T | null> {
  const stmt = db.prepare(sql)
  const result = params.length ? await stmt.bind(...params).first<T>() : await stmt.first<T>()
  return result ?? null
}

// Helper: run a write (INSERT/UPDATE/DELETE)
export async function exec(
  db: D1Database,
  sql: string,
  params: any[] = []
): Promise<D1Result> {
  const stmt = db.prepare(sql)
  return params.length ? stmt.bind(...params).run() : stmt.run()
}

// Helper: run multiple writes in a batch
export async function batch(
  db: D1Database,
  statements: Array<{ sql: string; params?: any[] }>
): Promise<void> {
  const stmts = statements.map(({ sql, params = [] }) => {
    const s = db.prepare(sql)
    return params.length ? s.bind(...params) : s
  })
  await db.batch(stmts)
}

// Generate a cuid-like ID (edge-compatible)
export function newId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  const random2 = Math.random().toString(36).substring(2, 10)
  return `c${timestamp}${random}${random2}`
}

// Format date for SQLite storage
export function toSQLiteDate(date: Date | string): string {
  return new Date(date).toISOString()
}
