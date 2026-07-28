import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { calcUsageRate } from '@/lib/coupons'
import { ensureCouponTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCouponTables()

  // Per-coupon usage aggregation
  const rows = await query(
    `SELECT
       c.id        AS couponId,
       c.code,
       c.name,
       c.usedCount,
       c.usageLimit,
       COALESCE(SUM(u.discountAmount), 0) AS totalDiscount
     FROM Coupon c
     LEFT JOIN CouponUsage u ON u.couponId = c.id AND u.storeId = c.storeId
     WHERE c.storeId = ?
     GROUP BY c.id, c.code, c.name, c.usedCount, c.usageLimit
     ORDER BY c.usedCount DESC`,
    [storeId],
  )

  const analytics = (rows as any[]).map(r => ({
    couponId: r.couponId,
    code: r.code,
    name: r.name,
    usedCount: r.usedCount,
    usageLimit: r.usageLimit,
    usageRate: calcUsageRate(r.usedCount, r.usageLimit),
    totalDiscount: r.totalDiscount,
  }))

  return NextResponse.json(analytics)
}
