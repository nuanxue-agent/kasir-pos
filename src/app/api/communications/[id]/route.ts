// PATCH /api/communications/:id  — update status
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  SENT:      ['DELIVERED', 'FAILED'],
  DELIVERED: ['READ', 'FAILED'],
  READ:      [],
  FAILED:    [],
}

const patchSchema = z.object({
  status: z.enum(['SENT', 'DELIVERED', 'READ', 'FAILED']),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { id } = await params
  if (!id) return err('Communication id required')

  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message)

  const { status: newStatus } = parsed.data

  const row = await queryOne<any>(
    `SELECT id, storeId, status FROM CommunicationLog WHERE id = ?`,
    [id],
  )
  if (!row) return err('Communication not found', 404)
  if (!storeIds.includes(row.storeId)) return err('Store not found', 404)

  const allowed = VALID_TRANSITIONS[row.status] ?? []
  if (!allowed.includes(newStatus)) {
    return err(`Cannot transition from ${row.status} to ${newStatus}`, 422)
  }

  await exec(
    `UPDATE CommunicationLog SET status = ? WHERE id = ?`,
    [newStatus, id],
  )

  const updated = await queryOne<any>(
    `SELECT cl.*, c.name AS customerName, c.email AS customerEmail, c.phone AS customerPhone
     FROM CommunicationLog cl
     LEFT JOIN Customer c ON c.id = cl.customerId
     WHERE cl.id = ?`,
    [id],
  )

  return NextResponse.json({
    ...(updated as any),
    metadata: (() => {
      try { return (updated as any).metadata ? JSON.parse((updated as any).metadata) : null }
      catch { return null }
    })(),
  })
}
