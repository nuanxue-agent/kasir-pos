/**
 * @module db
 * Cloudflare D1 query helpers.
 * Automatically selects the D1 binding (when on Cloudflare Pages) or falls back
 * to the HTTP API (when running on Vercel / Node.js).
 *
 * All functions throw on DB errors — callers should handle or let the route
 * error boundary catch them.
 */
// D1 via Cloudflare HTTP API — works from Vercel, Node.js, or edge
// Falls back to direct D1 binding when running on Cloudflare Pages

const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID ?? 'bccfd906f27fd0a0406bcc9307e6f8ac'
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? ''
const CF_DB_ID = process.env.CLOUDFLARE_D1_DATABASE_ID ?? '5ac8c796-3a0b-44eb-95f6-adf63244e1cd'

interface D1Response {
  result: Array<{ results: any[]; success: boolean }>
  success: boolean
  errors: any[]
}

// Execute SQL via Cloudflare D1 HTTP API
async function d1Fetch(sql: string, params: any[] = []): Promise<any[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${CF_DB_ID}/query`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  })

  const data = (await res.json()) as D1Response
  if (!data.success) {
    throw new Error(`D1 error: ${JSON.stringify(data.errors)}`)
  }
  return data.result?.[0]?.results ?? []
}

// Get D1 binding if on Cloudflare Pages, otherwise use HTTP API
function getD1Binding(): D1Database | null {
  try {
    // Only attempt in Cloudflare Pages runtime (not Vercel/Node)
    if (typeof (globalThis as any).__next_on_pages__fetch === 'undefined') return null
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@cloudflare/next-on-pages')
    const { env } = mod.getRequestContext()
    return (env as any).DB ?? null
  } catch {
    return null
  }
}

/**
 * Run a SELECT (or any statement that returns rows) against D1.
 * @param sql   Parameterised SQL string using `?` placeholders.
 * @param params Positional bind values.
 * @returns Array of typed row objects (empty array when no rows match).
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = getD1Binding()
  if (db) {
    const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql)
    const r = await stmt.all<T>()
    return r.results ?? []
  }
  return d1Fetch(sql, params) as Promise<T[]>
}

/**
 * Run a query and return only the first row, or `null` when no rows match.
 * Convenience wrapper around `query` for single-row lookups.
 */
export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const results = await query<T>(sql, params)
  return results[0] ?? null
}

/**
 * Execute a write statement (INSERT / UPDATE / DELETE / DDL).
 * Discards the result set — use `query` when you need RETURNING rows.
 */
export async function exec(sql: string, params: any[] = []): Promise<void> {
  await query(sql, params)
}

export async function batchExec(statements: Array<{ sql: string; params?: any[] }>): Promise<void> {
  const db = getD1Binding()
  if (db) {
    await db.batch(
      statements.map(s =>
        s.params?.length ? db.prepare(s.sql).bind(...s.params) : db.prepare(s.sql),
      ),
    )
    return
  }
  // HTTP API batch
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${CF_DB_ID}/query`
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(statements.map(s => ({ sql: s.sql, params: s.params ?? [] }))),
  })
}

/**
 * Generate a collision-resistant, URL-safe unique ID.
 * Format: `c<timestamp-base36><random>` — sortable and ~globally unique.
 */
export function newId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Return the current UTC timestamp as an ISO 8601 string.
 * Use this for all `createdAt` / `updatedAt` DB columns so timestamps are
 * consistently formatted and timezone-free.
 */
export function nowISO(): string {
  return new Date().toISOString()
}
