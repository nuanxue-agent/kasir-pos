// POST /api/webhooks/test/:id — send test payload to webhook URL
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, newId, nowISO } from '@/lib/db'
import { buildWebhookPayload, signWebhookPayload } from '@/lib/webhook-utils'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { id } = await params
  const wh = await queryOne<any>(
    'SELECT id, storeId, url, events, secret FROM WebhookEndpoint WHERE id = ?',
    [id],
  )
  if (!wh || !storeIds.includes(wh.storeId)) return err('Not found', 404)

  const events: string[] = (() => { try { return JSON.parse(wh.events) } catch { return [] } })()
  const event = events[0] ?? 'order.created'
  const payload = buildWebhookPayload(event, { test: true, storeId: wh.storeId })
  const signature = signWebhookPayload(JSON.stringify(payload), wh.secret)

  let responseCode: number | null = null
  let status: 'SUCCESS' | 'FAILED' = 'FAILED'

  try {
    const res = await fetch(wh.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': event,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })
    responseCode = res.status
    status = res.ok ? 'SUCCESS' : 'FAILED'
  } catch {
    status = 'FAILED'
  }

  const deliveryId = newId()
  const deliveredAt = nowISO()

  await exec(
    'INSERT INTO WebhookDelivery (id, webhookId, event, status, responseCode, deliveredAt) VALUES (?, ?, ?, ?, ?, ?)',
    [deliveryId, id, event, status, responseCode, deliveredAt],
  )

  return NextResponse.json({ id: deliveryId, event, status, responseCode, deliveredAt })
}
