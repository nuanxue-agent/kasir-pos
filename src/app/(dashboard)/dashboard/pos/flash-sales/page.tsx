import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import FlashSaleClient from '@/components/pos/FlashSaleClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Flash Sales — POS' }

export default async function FlashSalesPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const store = user.stores?.[0]
  const storeId: string = store?.id ?? ''
  const currency: string = store?.currency ?? 'IDR'

  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS FlashSale (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    name      TEXT NOT NULL,
    startAt   TEXT NOT NULL,
    endAt     TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'SCHEDULED',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS FlashSaleItem (
    id            TEXT PRIMARY KEY,
    saleId        TEXT NOT NULL,
    storeId       TEXT NOT NULL,
    productId     TEXT NOT NULL,
    originalPrice REAL NOT NULL DEFAULT 0,
    salePrice     REAL NOT NULL DEFAULT 0,
    discountPct   REAL NOT NULL DEFAULT 0,
    stockLimit    INTEGER NOT NULL DEFAULT 0,
    soldQty       INTEGER NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)

  return (
    <Suspense fallback={<PageSkeleton />}>
      <FlashSaleClient storeId={storeId} currency={currency} />
    </Suspense>
  )
}
