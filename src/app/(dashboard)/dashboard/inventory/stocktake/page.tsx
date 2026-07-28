import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { exec } from '@/lib/db'
import StocktakeClient from '@/components/inventory/StocktakeSessionClient'

export const metadata = { title: 'Stocktake — Inventory' }

export default async function StocktakePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  const currency: string = user.stores?.[0]?.currency ?? 'IDR'

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS Stocktake (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    warehouseId TEXT,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'DRAFT',
    startedAt   TEXT NOT NULL,
    completedAt TEXT,
    completedBy TEXT,
    notes       TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS StocktakeItem (
    id          TEXT PRIMARY KEY,
    stocktakeId TEXT NOT NULL,
    productId   TEXT NOT NULL,
    systemQty   REAL NOT NULL DEFAULT 0,
    countedQty  REAL,
    variance    REAL NOT NULL DEFAULT 0,
    notes       TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Suspense fallback={<div className="p-6 text-sm text-[var(--text-3)]">Memuat...</div>}>
        <StocktakeClient storeId={storeId} currency={currency} />
      </Suspense>
    </main>
  )
}
