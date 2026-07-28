import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import StockAgeClient from '@/components/inventory/StockAgeClient'

export const metadata = { title: 'Stock Age Analysis — Inventory' }

export default async function StockAgePage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS StockAge (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    warehouseId TEXT,
    batchId     TEXT,
    receivedAt  TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 0,
    cost        REAL NOT NULL DEFAULT 0,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)

  const currency: string = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <StockAgeClient storeId={storeId} currency={currency} />
    </main>
  )
}
