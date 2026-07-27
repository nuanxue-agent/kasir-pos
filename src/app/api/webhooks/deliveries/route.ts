// GET /api/webhooks/deliveries?webhookId=xxx
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const webhookId = req.nextUrl.searchParams.get('webhookId') ?? ''
  if (!webhookId) return err('webhookId required')

  // verify ownership
  const wh = await queryOne<any>('SELECT storeId FROM WebhookEndpoint WHERE id = ?', [webhookId])
  if (!wh || !storeIds.includes(wh.storeId)) return err('Not found', 404)

  const rows = await query<any>(
    'SELECT id, webhookId, event, status, responseCode, deliveredAt FROM WebhookDelivery WHERE webhookId = ? ORDER BY deliveredAt DESC LIMIT 50',
    [webhookId],
  )

  return NextResponse.json(rows)
}
