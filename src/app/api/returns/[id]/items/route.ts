// GET /api/returns/:id/items
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId =
    req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id } = await params

  // Verify the return belongs to this store
  const [ret] = (await query(
    `SELECT id FROM Return WHERE id=? AND storeId=?`,
    [id, storeId],
  )) as any[]
  if (!ret) return err('Return not found', 404, 'NOT_FOUND')

  const items = await query(
    `SELECT * FROM ReturnItem WHERE returnId=? ORDER BY rowid ASC`,
    [id],
  )

  return NextResponse.json(items)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId =
    req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id } = await params

  // Verify the return belongs to this store and is still editable
  const [ret] = (await query(
    `SELECT id, status FROM Return WHERE id = ? AND storeId = ?`,
    [id, storeId],
  )) as any[]
  if (!ret) return err('Return not found', 404, 'NOT_FOUND')
  if (!['PENDING'].includes(ret.status)) {
    return err(
      'Items can only be added to a PENDING return',
      400,
      'INVALID_STATE',
    )
  }

  const b = (await req.json()) as any
  if (!b.productId) return err('productId required', 400, 'MISSING_FIELD')
  if (!b.qty || Number(b.qty) < 1) return err('qty must be >= 1', 400, 'VALIDATION_ERROR')
  if (!b.unitPrice || Number(b.unitPrice) < 0) return err('unitPrice must be >= 0', 400, 'VALIDATION_ERROR')

  const condition = b.condition ?? 'GOOD'
  if (!['GOOD', 'DAMAGED', 'EXPIRED'].includes(condition)) {
    return err('condition must be GOOD, DAMAGED, or EXPIRED', 400, 'VALIDATION_ERROR')
  }
  const restockable = condition === 'GOOD' ? 1 : 0

  const qty = Number(b.qty)
  const unitPrice = Number(b.unitPrice)
  const subtotal = qty * unitPrice
  const itemId = newId()

  await exec(
    `INSERT INTO ReturnItem (id, returnId, productId, productName, qty, unitPrice, subtotal, condition, restockable)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [itemId, id, b.productId, b.productName ?? '', qty, unitPrice, subtotal, condition, restockable],
  )

  // Recalculate totalRefund on the parent Return
  const allItems = (await query(
    `SELECT subtotal FROM ReturnItem WHERE returnId = ?`,
    [id],
  )) as any[]
  const totalRefund = allItems.reduce((s: number, r: any) => s + Number(r.subtotal), 0)
  await exec(
    `UPDATE Return SET totalRefund = ? WHERE id = ?`,
    [totalRefund, id],
  )

  return NextResponse.json({ id: itemId, subtotal, totalRefund }, { status: 201 })
}
