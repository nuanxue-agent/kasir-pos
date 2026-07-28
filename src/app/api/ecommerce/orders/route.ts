import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

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

// GET /api/ecommerce/orders?storeId=xxx&channel=xxx&status=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const storeId = await getStoreId(req)
    if (!storeId) return err('Forbidden', 403)

    await ensureTables()

    const url = new URL(req.url)
    const channel = url.searchParams.get('channel')
    const status = url.searchParams.get('status')

    let sql = `SELECT * FROM OnlineOrder WHERE storeId = ?`
    const params: any[] = [storeId]

    if (channel) {
      sql += ` AND channel = ?`
      params.push(channel.toUpperCase())
    }
    if (status) {
      sql += ` AND status = ?`
      params.push(status.toUpperCase())
    }
    sql += ` ORDER BY createdAt DESC`

    const rows = await query(sql, params)
    const orders = (rows as any[]).map(r => ({
      ...r,
      items: (() => {
        try { return JSON.parse(r.items) } catch { return [] }
      })(),
    }))

    return ok(orders)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
