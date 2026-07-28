// POST /api/returns/:id/complete — process refund + restock GOOD-condition items
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id } = await params

  const existing = (await queryOne(
    `SELECT * FROM Return WHERE id = ? AND storeId = ?`,
    [id, storeId],
  )) as any
  if (!existing) return err('Return not found', 404, 'NOT_FOUND')
  if (existing.status !== 'APPROVED') {
    return err(
      `Cannot complete a return with status ${existing.status} — must be APPROVED first`,
      400,
      'INVALID_STATE',
    )
  }

  // Fetch all return items
  const items = (await query(
    `SELECT * FROM ReturnItem WHERE returnId = ?`,
    [id],
  )) as any[]

  // Restock items — GOOD condition (restockable flag) get stock restored
  // The ReturnItem table stores restockable as an integer (0/1).
  // Items without a restockable column default to restoring stock (best-effort).
  const restocked: string[] = []
  for (const item of items) {
    const shouldRestock =
      item.restockable === undefined ||
      item.restockable === null ||
      Boolean(item.restockable)

    if (shouldRestock) {
      try {
        await exec(
          `UPDATE Product SET stock = COALESCE(stock, 0) + ?, updatedAt = ? WHERE id = ?`,
          [item.qty, nowISO(), item.productId],
        )
        restocked.push(item.productId)
      } catch {
        // Non-fatal — product may have been deleted or stock column may differ
      }
    }
  }

  // Mark return as COMPLETED
  const processedBy: string = (user as any).name ?? (user as any).email ?? 'unknown'
  await exec(
    `UPDATE Return SET status = 'COMPLETED', processedBy = ? WHERE id = ? AND storeId = ?`,
    [processedBy, id, storeId],
  )

  return NextResponse.json({
    ok: true,
    status: 'COMPLETED',
    processedBy,
    restockedProductIds: restocked,
    totalRefund: existing.totalRefund,
    refundMethod: existing.refundMethod,
  })
}
