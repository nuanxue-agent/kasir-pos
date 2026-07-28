import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import CouponEngineClient from '@/components/crm/CouponEngineClient'

export const metadata = { title: 'Kupon & Promo — CRM' }

export default async function CouponsPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await exec(`CREATE TABLE IF NOT EXISTS Coupon (
    id               TEXT PRIMARY KEY,
    storeId          TEXT NOT NULL,
    code             TEXT NOT NULL,
    name             TEXT NOT NULL,
    discountType     TEXT NOT NULL DEFAULT 'PERCENTAGE',
    discountValue    REAL NOT NULL DEFAULT 0,
    minOrderAmount   REAL NOT NULL DEFAULT 0,
    maxDiscount      REAL,
    usageLimit       INTEGER,
    usedCount        INTEGER NOT NULL DEFAULT 0,
    perCustomerLimit INTEGER,
    segments         TEXT NOT NULL DEFAULT '[]',
    productIds       TEXT NOT NULL DEFAULT '[]',
    categoryIds      TEXT NOT NULL DEFAULT '[]',
    startDate        TEXT,
    endDate          TEXT,
    active           INTEGER NOT NULL DEFAULT 1,
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS CouponUsage (
    id             TEXT PRIMARY KEY,
    couponId       TEXT NOT NULL,
    customerId     TEXT NOT NULL,
    storeId        TEXT NOT NULL,
    orderId        TEXT,
    discountAmount REAL NOT NULL DEFAULT 0,
    usedAt         TEXT NOT NULL
  )`)

  const rows = await query(
    `SELECT * FROM Coupon WHERE storeId = ? ORDER BY createdAt DESC`,
    [storeId],
  )

  const coupons = (rows as any[]).map(r => ({
    ...r,
    active: Boolean(r.active),
    segments: JSON.parse(r.segments || '[]'),
    productIds: JSON.parse(r.productIds || '[]'),
    categoryIds: JSON.parse(r.categoryIds || '[]'),
  }))

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <CouponEngineClient
        storeId={storeId}
        currency={currency}
        initialCoupons={coupons}
      />
    </main>
  )
}
