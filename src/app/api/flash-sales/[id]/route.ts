// PATCH /api/flash-sales/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id } = await params

  const existing = await queryOne(`SELECT * FROM FlashSale WHERE id=? AND storeId=?`, [
    id,
    storeId,
  ])
  if (!existing) return err('Flash sale not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const updates: Record<string, any> = {}
  if (b.name !== undefined) updates.name = b.name
  if (b.startAt !== undefined) updates.startAt = b.startAt
  if (b.endAt !== undefined) updates.endAt = b.endAt
  if (b.active !== undefined) updates.active = b.active ? 1 : 0
  if (Object.keys(updates).length === 0) return err('Nothing to update', 400, 'VALIDATION_ERROR')

  // Validate date range if either date is being updated
  const startAt = updates.startAt ?? (existing as any).startAt
  const endAt = updates.endAt ?? (existing as any).endAt
  if (new Date(endAt) <= new Date(startAt))
    return err("'endAt' must be after 'startAt'", 400, 'VALIDATION_ERROR')

  updates.updatedAt = nowISO()
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ')
  await exec(
    `UPDATE FlashSale SET ${setClauses} WHERE id=? AND storeId=?`,
    [...Object.values(updates), id, storeId],
  )
  return NextResponse.json({ updated: true })
}
