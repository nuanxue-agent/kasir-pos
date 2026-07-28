import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import LotTrackingClient from '@/components/inventory/LotTrackingClient'

export const metadata = { title: 'Lot & Batch Tracking — Inventory' }

export default async function LotTrackingPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS Lot (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    productId    TEXT NOT NULL,
    lotNumber    TEXT NOT NULL,
    expiryDate   TEXT NOT NULL,
    receivedDate TEXT NOT NULL,
    initialQty   REAL NOT NULL DEFAULT 0,
    remainingQty REAL NOT NULL DEFAULT 0,
    supplierId   TEXT,
    costPerUnit  REAL NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'ACTIVE',
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)

  const products = await query(
    `SELECT id, name FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
    [storeId]
  )

  const currency: string = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <LotTrackingClient
        storeId={storeId}
        currency={currency}
        products={products as any[]}
      />
    </main>
  )
}
