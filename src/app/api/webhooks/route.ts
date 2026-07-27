// GET /api/webhooks?storeId=xxx
// POST /api/webhooks — register new endpoint
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { generateWebhookSecret } from '@/lib/webhook-utils'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// Lazy-init table
async function ensureTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS WebhookEndpoint (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      secret TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS WebhookDelivery (
      id TEXT PRIMARY KEY,
      webhookId TEXT NOT NULL,
      event TEXT NOT NULL,
      status TEXT NOT NULL,
      responseCode INTEGER,
      deliveredAt TEXT NOT NULL
    )
  `)
}

const postSchema = z.object({
  storeId: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const storeId = req.nextUrl.searchParams.get('storeId') ?? ''
  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 404)

  await ensureTable()

  const rows = await query<any>(
    'SELECT id, storeId, url, events, secret, active, createdAt FROM WebhookEndpoint WHERE storeId = ? ORDER BY createdAt DESC',
    [storeId],
  )

  const webhooks = rows.map(r => ({
    ...r,
    events: (() => { try { return JSON.parse(r.events) } catch { return [] } })(),
    active: r.active === 1 || r.active === true,
  }))

  return NextResponse.json(webhooks)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const body = await req.json().catch(() => ({}))
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message)

  const { storeId, url, events } = parsed.data
  if (!storeIds.includes(storeId)) return err('Store not found', 404)

  await ensureTable()

  const id = newId()
  const secret = generateWebhookSecret()
  const now = nowISO()

  await exec(
    'INSERT INTO WebhookEndpoint (id, storeId, url, events, secret, active, createdAt) VALUES (?, ?, ?, ?, ?, 1, ?)',
    [id, storeId, url, JSON.stringify(events), secret, now],
  )

  return NextResponse.json({ id, storeId, url, events, secret, active: true, createdAt: now }, { status: 201 })
}
