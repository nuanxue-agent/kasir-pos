// DELETE /api/webhooks/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { id } = await params
  const row = await queryOne<any>('SELECT storeId FROM WebhookEndpoint WHERE id = ?', [id])
  if (!row || !storeIds.includes(row.storeId)) return err('Not found', 404)

  await exec('DELETE FROM WebhookEndpoint WHERE id = ?', [id])
  await exec('DELETE FROM WebhookDelivery WHERE webhookId = ?', [id])

  return NextResponse.json({ success: true })
}
