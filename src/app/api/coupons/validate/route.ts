import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { validateCoupon, type Coupon } from '@/lib/coupons'
import { ensureCouponTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCouponTables()

  const b = (await req.json()) as any
  const { code, customerId, orderAmount } = b

  if (!code) return err("Field 'code' is required", 400, 'MISSING_FIELD')
  if (orderAmount === undefined || orderAmount === null) return err("Field 'orderAmount' is required", 400, 'MISSING_FIELD')

  const rows = await query(
    `SELECT * FROM Coupon WHERE storeId = ? AND code = ?`,
    [storeId, String(code).toUpperCase().trim()],
  )

  if ((rows as any[]).length === 0) {
    return NextResponse.json({ valid: false, discount: 0, reason: 'Kode kupon tidak ditemukan' })
  }

  const row = (rows as any[])[0]
  const coupon: Coupon = {
    ...row,
    active: Boolean(row.active),
    segments: JSON.parse(row.segments || '[]'),
    productIds: JSON.parse(row.productIds || '[]'),
    categoryIds: JSON.parse(row.categoryIds || '[]'),
  }

  // Count per-customer usage
  let customerUsageCount = 0
  if (customerId && coupon.perCustomerLimit !== null) {
    const usageRows = await query(
      `SELECT COUNT(*) as cnt FROM CouponUsage WHERE couponId = ? AND customerId = ?`,
      [coupon.id, customerId],
    )
    customerUsageCount = (usageRows as any[])[0]?.cnt ?? 0
  }

  const result = validateCoupon({
    coupon,
    orderAmount: Number(orderAmount),
    customerId: customerId ?? '',
    customerUsageCount,
  })

  return NextResponse.json({
    valid: result.valid,
    discount: result.discount,
    reason: result.reason,
    couponId: result.valid ? coupon.id : undefined,
    discountType: result.valid ? coupon.discountType : undefined,
  })
}
