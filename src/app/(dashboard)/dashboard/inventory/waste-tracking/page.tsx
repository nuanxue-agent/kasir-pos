import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'
import WasteTrackingClient from '@/components/inventory/WasteTrackingClient'

export const metadata = { title: 'Waste Tracking — Inventory' }

export default async function WasteTrackingPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await exec(`CREATE TABLE IF NOT EXISTS WasteLog (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    productName TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 0,
    reason      TEXT NOT NULL DEFAULT 'OTHER',
    cost        REAL NOT NULL DEFAULT 0,
    recordedBy  TEXT NOT NULL,
    recordedAt  TEXT NOT NULL,
    notes       TEXT
  )`)

  const [logsRaw, productsRaw] = await Promise.all([
    query(
      `SELECT * FROM WasteLog WHERE storeId = ? ORDER BY recordedAt DESC LIMIT 200`,
      [storeId]
    ),
    query(
      `SELECT id, name, category, cost FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId]
    ),
  ])

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--text-3)]">Memuat…</div>}>
      <WasteTrackingClient
        storeId={storeId}
        currency={currency}
        initialLogs={logsRaw as any[]}
        products={productsRaw as any[]}
      />
    </Suspense>
  )
}
