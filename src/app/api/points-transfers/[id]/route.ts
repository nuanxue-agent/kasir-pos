// PATCH /api/points-transfers/[id]  — cancel a transfer
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CANCELLED'],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  if (!id) return err('Transfer id required', 400, 'MISSING_FIELD')

  const b = (await req.json()) as any
  const { status: newStatus } = b
  if (!newStatus) return err("Field 'status' is required", 400, 'MISSING_FIELD')

  const rows = await query(
    `SELECT * FROM PointsTransfer WHERE id=? LIMIT 1`,
    [id],
  )
  const transfer = (rows as any[])[0]
  if (!transfer) return err('Transfer not found', 404, 'NOT_FOUND')

  const allowed = VALID_TRANSITIONS[transfer.status] ?? []
  if (!allowed.includes(newStatus)) {
    return err(
      `Cannot transition from ${transfer.status} to ${newStatus}`,
      400,
      'INVALID_TRANSITION',
    )
  }

  await exec(
    `UPDATE PointsTransfer SET status=? WHERE id=?`,
    [newStatus, id],
  )

  // If cancelling a COMPLETED transfer, reverse the points
  if (newStatus === 'CANCELLED' && transfer.status === 'COMPLETED') {
    const { storeId, fromCustomerId, toCustomerId, points } = transfer
    await exec(
      `UPDATE Customer SET loyaltyPoints = COALESCE(loyaltyPoints,0) + ? WHERE id=? AND storeId=?`,
      [points, fromCustomerId, storeId],
    )
    await exec(
      `UPDATE Customer SET loyaltyPoints = MAX(0, COALESCE(loyaltyPoints,0) - ?) WHERE id=? AND storeId=?`,
      [points, toCustomerId, storeId],
    )
  }

  return NextResponse.json({ ...transfer, status: newStatus })
}
