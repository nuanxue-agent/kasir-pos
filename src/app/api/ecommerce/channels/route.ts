import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function getStoreId(req: NextRequest): Promise<string | null> {
  const session = await auth()
  if (!session?.user) return null
  const user = session.user as { stores?: { id: string }[] }
  const urlStoreId = new URL(req.url).searchParams.get('storeId')
  if (urlStoreId) {
    const hasAccess = user.stores?.some(s => s.id === urlStoreId) ?? false
    return hasAccess ? urlStoreId : null
  }
  return user.stores?.[0]?.id ?? null
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ChannelConfig (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    channel TEXT NOT NULL,
    apiKey TEXT,
    storeUrl TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    lastSyncAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS OnlineOrder (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    channel TEXT NOT NULL,
    externalId TEXT NOT NULL,
    customerName TEXT NOT NULL,
    items TEXT NOT NULL,
    total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    createdAt TEXT NOT NULL
  )`)
}

// GET /api/ecommerce/channels?storeId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const storeId = await getStoreId(req)
    if (!storeId) return err('Forbidden', 403)

    await ensureTables()

    const rows = await query(
      `SELECT * FROM ChannelConfig WHERE storeId = ? ORDER BY channel`,
      [storeId],
    )
    return ok((rows as any[]).map(r => ({ ...r, active: Boolean(r.active) })))
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/ecommerce/channels
// Body: { storeId?, channel, apiKey?, storeUrl?, active? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const body = (await req.json()) as any
    const user = session.user as { stores?: { id: string }[] }
    const storeId: string = body.storeId ?? user.stores?.[0]?.id ?? ''
    if (!storeId) return err('storeId required')
    const hasAccess = user.stores?.some(s => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const VALID_CHANNELS = ['WOOCOMMERCE', 'TOKOPEDIA', 'SHOPEE', 'DIRECT']
    if (!body.channel || !VALID_CHANNELS.includes(body.channel)) {
      return err(`channel must be one of: ${VALID_CHANNELS.join(', ')}`)
    }

    await ensureTables()

    const t = nowISO()

    // Upsert by storeId+channel
    const existing = await query(
      `SELECT id FROM ChannelConfig WHERE storeId = ? AND channel = ?`,
      [storeId, body.channel],
    )

    if ((existing as any[]).length > 0) {
      const id = (existing as any[])[0].id
      await exec(
        `UPDATE ChannelConfig SET apiKey=?, storeUrl=?, active=?, updatedAt=? WHERE id=?`,
        [body.apiKey ?? null, body.storeUrl ?? null, body.active !== false ? 1 : 0, t, id],
      )
      return ok({ id, channel: body.channel, updated: true })
    }

    const id = newId()
    await exec(
      `INSERT INTO ChannelConfig (id,storeId,channel,apiKey,storeUrl,active,lastSyncAt,createdAt,updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, storeId, body.channel, body.apiKey ?? null, body.storeUrl ?? null,
       body.active !== false ? 1 : 0, null, t, t],
    )
    return ok({ id, channel: body.channel, created: true }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
