import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import PurchaseOrderClient from '@/components/inventory/PurchaseOrderClient'

export const metadata = { title: 'Purchase Orders — Inventory' }

export default async function PurchaseOrdersPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS PurchaseOrder (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    vendorId     TEXT NOT NULL,
    poNumber     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'DRAFT',
    orderDate    TEXT NOT NULL,
    expectedDate TEXT,
    subtotal     REAL NOT NULL DEFAULT 0,
    taxAmount    REAL NOT NULL DEFAULT 0,
    total        REAL NOT NULL DEFAULT 0,
    notes        TEXT,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS PurchaseOrderItem (
    id          TEXT PRIMARY KEY,
    poId        TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 1,
    unitPrice   REAL NOT NULL DEFAULT 0,
    total       REAL NOT NULL DEFAULT 0,
    receivedQty REAL NOT NULL DEFAULT 0
  )`)

  const [posRaw, vendorsRaw, productsRaw] = await Promise.all([
    query(
      `SELECT po.*, v.name as vendorName
       FROM PurchaseOrder po
       LEFT JOIN Vendor v ON po.vendorId = v.id
       WHERE po.storeId = ?
       ORDER BY po.createdAt DESC`,
      [storeId]
    ).catch(() =>
      query(`SELECT * FROM PurchaseOrder WHERE storeId = ? ORDER BY createdAt DESC`, [storeId])
    ),
    query(`SELECT id, name FROM Vendor WHERE storeId = ? ORDER BY name ASC`, [storeId]).catch(() => []),
    query(
      `SELECT id, name, cost FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId]
    ).catch(() => []),
  ])

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <PurchaseOrderClient
        storeId={storeId}
        currency={currency}
        initialPOs={posRaw as any[]}
        vendors={vendorsRaw as any[]}
        products={productsRaw as any[]}
      />
    </main>
  )
}
