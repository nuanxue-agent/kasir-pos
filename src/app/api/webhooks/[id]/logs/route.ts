// GET /api/webhooks/:id/logs — paginated webhook log entries
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne } from '@/lib/db'
import { ensureApiKeyTables } from '@/app/api/api-keys/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureWebhookLogTable() {
  // ensureApiKeyTables creates the WebhookLog table; also ensure WebhookEndpoint exists
  await ensureApiKeyTables()
  await exec(`CREATE TABLE IF NOT EXISTS WebhookEndpoint (
    id              TEXT PRIMARY KEY,
    storeId         TEXT NOT NULL,
    url             TEXT NOT NULL,
    events          TEXT NOT NULL DEFAULT '[]',
    secret          TEXT NOT NULL,
    active          INTEGER NOT NULL DEFAULT 1,
    lastTriggeredAt TEXT,
    createdAt       TEXT NOT NULL
  )`)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { id } = await params

  await ensureWebhookLogTable()

  const webhook = (await queryOne(`SELECT id, storeId FROM WebhookEndpoint WHERE id = ?`, [id])) as any
  if (!webhook || !storeIds.includes(webhook.storeId)) return err('Not found', 404, 'NOT_FOUND')

  const sp = req.nextUrl.searchParams
  const limit = Math.min(parseInt(sp.get('limit') ?? '50'), 100)
  const offset = parseInt(sp.get('offset') ?? '0')
  const statusFilter = sp.get('status') // SUCCESS | FAILED | null

  const conds: string[] = ['webhookId = ?']
  const vals: any[] = [id]
  if (statusFilter === 'SUCCESS' || statusFilter === 'FAILED') {
    conds.push('status = ?')
    vals.push(statusFilter)
  }

  const rows = await query(
    `SELECT id, webhookId, storeId, event, payload, status, responseCode, createdAt
     FROM WebhookLog WHERE ${conds.join(' AND ')} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
    [...vals, limit, offset],
  )

  const logs = (rows as any[]).map(r => ({
    ...r,
    payload: (() => { try { return JSON.parse(r.payload) } catch { return {} } })(),
  }))

  return NextResponse.json({ logs, limit, offset })
}
