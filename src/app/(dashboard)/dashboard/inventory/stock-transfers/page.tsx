import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import StockTransferClient from '@/components/inventory/StockTransferClient'

export const metadata = { title: 'Transfer Stok — Inventaris' }

export default async function StockTransfersPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS StockTransfer (
    id               TEXT PRIMARY KEY,
    fromStoreId      TEXT,
    toStoreId        TEXT,
    fromWarehouseId  TEXT,
    toWarehouseId    TEXT,
    status           TEXT NOT NULL DEFAULT 'DRAFT',
    requestedBy      TEXT NOT NULL,
    approvedBy       TEXT,
    notes            TEXT,
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS StockTransferItem (
    id           TEXT PRIMARY KEY,
    transferId   TEXT NOT NULL,
    productId    TEXT NOT NULL,
    requestedQty REAL NOT NULL DEFAULT 0,
    sentQty      REAL NOT NULL DEFAULT 0,
    receivedQty  REAL NOT NULL DEFAULT 0,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)

  const [transfersRaw, storesRaw, productsRaw] = await Promise.all([
    query(
      `SELECT * FROM StockTransfer WHERE (fromStoreId = ? OR toStoreId = ?) ORDER BY createdAt DESC LIMIT 50`,
      [storeId, storeId]
    ),
    query(
      `SELECT id, name FROM Store ORDER BY name ASC`,
      []
    ),
    query(
      `SELECT id, name, sku, stock FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId]
    ),
  ])

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <StockTransferClient
        storeId={storeId}
        currency={currency}
        initialTransfers={transfersRaw as any[]}
        stores={storesRaw as any[]}
        products={productsRaw as any[]}
      />
    </main>
  )
}
