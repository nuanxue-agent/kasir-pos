// POST /api/flash-sales/:id/items
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id: saleId } = await params

  const sale = await queryOne(`SELECT * FROM FlashSale WHERE id=? AND storeId=?`, [saleId, storeId])
  if (!sale) return err('Flash sale not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  if (!b.productId) return err("Field 'productId' is required", 400, 'MISSING_FIELD')
  if (b.discountValue === undefined || b.discountValue === null)
    return err("Field 'discountValue' is required", 400, 'MISSING_FIELD')

  const discountType = b.discountType === 'FIXED' ? 'FIXED' : 'PERCENTAGE'
  const discountValue = Number(b.discountValue)
  const maxQty = Number(b.maxQty ?? 0)

  if (discountType === 'PERCENTAGE' && (discountValue < 0 || discountValue > 100))
    return err('Percentage discount must be between 0 and 100', 400, 'VALIDATION_ERROR')
  if (discountValue < 0)
    return err('discountValue must be non-negative', 400, 'VALIDATION_ERROR')

  const id = newId()
  await exec(
    `INSERT INTO FlashSaleItem (id, saleId, productId, discountType, discountValue, maxQty, soldQty, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [id, saleId, b.productId, discountType, discountValue, maxQty, nowISO()],
  )
  return NextResponse.json({ id }, { status: 201 })
}
