// GET /api/api-keys?storeId=xxx
// POST /api/api-keys?storeId=xxx — generate new API key
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import {
  generateRawApiKey,
  extractKeyPrefix,
  hashApiKey,
  validateScopes,
  filterValidScopes,
} from '@/lib/api-keys'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureApiKeyTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ApiKey (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    name        TEXT NOT NULL,
    keyHash     TEXT NOT NULL,
    keyPrefix   TEXT NOT NULL,
    scopes      TEXT NOT NULL DEFAULT '[]',
    lastUsedAt  TEXT,
    expiresAt   TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    createdBy   TEXT NOT NULL,
    createdAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS WebhookLog (
    id           TEXT PRIMARY KEY,
    webhookId    TEXT NOT NULL,
    storeId      TEXT NOT NULL,
    event        TEXT NOT NULL,
    payload      TEXT NOT NULL DEFAULT '{}',
    status       TEXT NOT NULL DEFAULT 'FAILED',
    responseCode INTEGER,
    createdAt    TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []
  if (!storeIds.includes(storeId)) return err('Store not found', 404, 'NOT_FOUND')

  await ensureApiKeyTables()

  const rows = await query(
    `SELECT id, storeId, name, keyPrefix, scopes, lastUsedAt, expiresAt, active, createdBy, createdAt
     FROM ApiKey WHERE storeId = ? ORDER BY createdAt DESC`,
    [storeId],
  )

  const keys = (rows as any[]).map(r => ({
    ...r,
    active: Boolean(r.active),
    scopes: (() => { try { return JSON.parse(r.scopes) } catch { return [] } })(),
  }))

  return NextResponse.json(keys)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []
  if (!storeIds.includes(storeId)) return err('Store not found', 404, 'NOT_FOUND')

  await ensureApiKeyTables()

  const b = (await req.json()) as any
  if (!b.name?.trim()) return err("Field 'name' is required", 400, 'MISSING_FIELD')
  if (!b.scopes || !validateScopes(b.scopes)) {
    return err('Invalid or empty scopes', 400, 'INVALID_FIELD')
  }

  const rawKey = generateRawApiKey()
  const keyHash = hashApiKey(rawKey)
  const keyPrefix = extractKeyPrefix(rawKey)
  const scopes = filterValidScopes(b.scopes)
  const id = newId()
  const now = nowISO()
  const createdBy = (user.name ?? user.email ?? 'unknown') as string
  const expiresAt = b.expiresAt ?? null

  await exec(
    `INSERT INTO ApiKey (id, storeId, name, keyHash, keyPrefix, scopes, lastUsedAt, expiresAt, active, createdBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)`,
    [id, storeId, b.name.trim(), keyHash, keyPrefix, JSON.stringify(scopes), expiresAt, createdBy, now],
  )

  // Return the raw key ONCE — never stored, can't be retrieved again
  return NextResponse.json(
    { id, storeId, name: b.name.trim(), rawKey, keyPrefix, scopes, expiresAt, active: true, createdBy, createdAt: now },
    { status: 201 },
  )
}
