// GET /api/communications?storeId=xxx[&channel=...&direction=...&date=...]
// POST /api/communications
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CommunicationLog (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      customerId  TEXT NOT NULL,
      channel     TEXT NOT NULL CHECK(channel IN ('WHATSAPP','SMS','EMAIL','INAPP')),
      direction   TEXT NOT NULL CHECK(direction IN ('INBOUND','OUTBOUND')),
      subject     TEXT,
      body        TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'SENT' CHECK(status IN ('SENT','DELIVERED','READ','FAILED')),
      sentAt      TEXT NOT NULL,
      metadata    TEXT
    )
  `)
  await exec(`CREATE INDEX IF NOT EXISTS idx_commlog_store    ON CommunicationLog(storeId)`)
  await exec(`CREATE INDEX IF NOT EXISTS idx_commlog_customer ON CommunicationLog(customerId)`)
}

const postSchema = z.object({
  storeId:    z.string().min(1),
  customerId: z.string().min(1),
  channel:    z.enum(['WHATSAPP', 'SMS', 'EMAIL', 'INAPP']),
  direction:  z.enum(['INBOUND', 'OUTBOUND']),
  subject:    z.string().max(255).nullable().optional(),
  body:       z.string().min(1),
  status:     z.enum(['SENT', 'DELIVERED', 'READ', 'FAILED']).default('SENT'),
  sentAt:     z.string().optional(),
  metadata:   z.record(z.string(), z.unknown()).nullable().optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const sp = req.nextUrl.searchParams
  const storeId   = sp.get('storeId') ?? ''
  const channel   = sp.get('channel') ?? ''
  const direction = sp.get('direction') ?? ''
  const date      = sp.get('date') ?? ''

  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 404)

  await ensureTables()

  const conditions: string[] = ['cl.storeId = ?']
  const bindings: unknown[]  = [storeId]

  if (channel)   { conditions.push(`cl.channel = ?`);               bindings.push(channel) }
  if (direction) { conditions.push(`cl.direction = ?`);             bindings.push(direction) }
  if (date)      { conditions.push(`DATE(cl.sentAt) = DATE(?)`);    bindings.push(date) }

  const where = conditions.join(' AND ')

  const rows = await query<any>(
    `SELECT
       cl.id, cl.storeId, cl.customerId,
       cl.channel, cl.direction, cl.subject, cl.body,
       cl.status, cl.sentAt, cl.metadata,
       c.name  AS customerName,
       c.email AS customerEmail,
       c.phone AS customerPhone
     FROM CommunicationLog cl
     LEFT JOIN Customer c ON c.id = cl.customerId
     WHERE ${where}
     ORDER BY cl.sentAt DESC
     LIMIT 500`,
    bindings,
  )

  const result = rows.map((r: any) => ({
    ...r,
    metadata: (() => { try { return r.metadata ? JSON.parse(r.metadata) : null } catch { return null } })(),
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const body = await req.json().catch(() => ({}))
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message)

  const { storeId, customerId, channel, direction, subject, body: msgBody, status, sentAt, metadata } = parsed.data
  if (!storeIds.includes(storeId)) return err('Store not found', 404)

  await ensureTables()

  const id    = newId()
  const now   = sentAt ?? nowISO()
  const meta  = metadata ? JSON.stringify(metadata) : null

  await exec(
    `INSERT INTO CommunicationLog (id, storeId, customerId, channel, direction, subject, body, status, sentAt, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, customerId, channel, direction, subject ?? null, msgBody, status, now, meta],
  )

  return NextResponse.json({
    id, storeId, customerId, channel, direction,
    subject: subject ?? null, body: msgBody, status, sentAt: now,
    metadata: metadata ?? null,
    customerName: null, customerEmail: null, customerPhone: null,
  }, { status: 201 })
}
