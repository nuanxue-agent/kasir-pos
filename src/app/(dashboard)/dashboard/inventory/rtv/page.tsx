import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import RTVClient from '@/components/inventory/RTVClient'

export const metadata = { title: 'Return to Vendor (RTV) — Inventaris' }

export default async function RTVPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS RTVOrder (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    vendorId    TEXT,
    status      TEXT NOT NULL DEFAULT 'DRAFT',
    reason      TEXT NOT NULL DEFAULT 'DEFECTIVE',
    totalItems  REAL NOT NULL DEFAULT 0,
    totalValue  REAL NOT NULL DEFAULT 0,
    creditNote  REAL,
    notes       TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS RTVItem (
    id          TEXT PRIMARY KEY,
    rtvId       TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 0,
    unitCost    REAL NOT NULL DEFAULT 0,
    totalCost   REAL NOT NULL DEFAULT 0,
    condition   TEXT NOT NULL DEFAULT 'DAMAGED',
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)

  const [ordersRaw, productsRaw] = await Promise.all([
    query(
      `SELECT * FROM RTVOrder WHERE storeId = ? ORDER BY createdAt DESC LIMIT 50`,
      [storeId]
    ),
    query(
      `SELECT id, name, sku FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId]
    ),
  ])

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <RTVClient
        storeId={storeId}
        currency={currency}
        initialOrders={ordersRaw as any[]}
        products={productsRaw as any[]}
      />
    </main>
  )
}
