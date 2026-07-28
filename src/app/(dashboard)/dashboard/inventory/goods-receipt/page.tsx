import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import GoodsReceiptClient from '@/components/inventory/GoodsReceiptClient'

export const metadata = { title: 'Penerimaan Barang — Inventaris' }

export default async function GoodsReceiptPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS GoodsReceipt (
    id              TEXT PRIMARY KEY,
    storeId         TEXT NOT NULL,
    purchaseOrderId TEXT,
    receivedBy      TEXT NOT NULL,
    receivedAt      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDING',
    notes           TEXT,
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS GoodsReceiptItem (
    id              TEXT PRIMARY KEY,
    receiptId       TEXT NOT NULL,
    storeId         TEXT NOT NULL,
    productId       TEXT NOT NULL,
    orderedQty      REAL NOT NULL DEFAULT 0,
    receivedQty     REAL NOT NULL DEFAULT 0,
    acceptedQty     REAL NOT NULL DEFAULT 0,
    rejectedQty     REAL NOT NULL DEFAULT 0,
    unitCost        REAL NOT NULL DEFAULT 0,
    rejectionReason TEXT,
    inspectionNotes TEXT,
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL
  )`)

  const [receiptsRaw, productsRaw] = await Promise.all([
    query(
      `SELECT * FROM GoodsReceipt WHERE storeId = ? ORDER BY createdAt DESC LIMIT 50`,
      [storeId]
    ),
    query(
      `SELECT id, name, sku, stock FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId]
    ),
  ])

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <GoodsReceiptClient
        storeId={storeId}
        currency={currency}
        initialReceipts={receiptsRaw as any[]}
        products={productsRaw as any[]}
      />
    </main>
  )
}
