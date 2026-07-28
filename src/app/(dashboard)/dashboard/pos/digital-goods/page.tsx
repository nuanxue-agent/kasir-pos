import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import DigitalGoodsClient from '@/components/pos/DigitalGoodsClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Digital Goods — POS' }

export default async function DigitalGoodsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const store = user.stores?.[0]
  const storeId: string = store?.id ?? ''
  const currency: string = store?.currency ?? 'IDR'

  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS DigitalProduct (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'TOPUP',
    denomination REAL NOT NULL DEFAULT 0,
    price       REAL NOT NULL DEFAULT 0,
    margin      REAL NOT NULL DEFAULT 0,
    provider    TEXT NOT NULL DEFAULT '',
    active      INTEGER NOT NULL DEFAULT 1,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS DigitalSale (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    orderId       TEXT,
    productId     TEXT NOT NULL,
    customerPhone TEXT NOT NULL DEFAULT '',
    serialNumber  TEXT,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    processedAt   TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)

  return (
    <Suspense fallback={<PageSkeleton />}>
      <DigitalGoodsClient storeId={storeId} currency={currency} />
    </Suspense>
  )
}
