import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import ProductionOrderClient from '@/components/inventory/ProductionOrderClient'

export const metadata = { title: 'Produksi — Inventory' }

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ProductionOrder (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    productId     TEXT NOT NULL,
    qty           REAL NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'DRAFT',
    scheduledDate TEXT,
    completedDate TEXT,
    notes         TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ProductionMaterial (
    id                TEXT PRIMARY KEY,
    orderId           TEXT NOT NULL,
    storeId           TEXT NOT NULL,
    materialProductId TEXT NOT NULL,
    requiredQty       REAL NOT NULL DEFAULT 0,
    usedQty           REAL NOT NULL DEFAULT 0
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS BillOfMaterials (
    id         TEXT PRIMARY KEY,
    storeId    TEXT NOT NULL,
    productId  TEXT NOT NULL,
    materialId TEXT NOT NULL,
    qty        REAL NOT NULL DEFAULT 1,
    unit       TEXT
  )`)
}

export default async function ProductionPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await ensureTables()

  const [ordersRaw, bomRaw, productsRaw] = await Promise.all([
    query(
      `SELECT po.*, p.name AS productName
       FROM ProductionOrder po
       LEFT JOIN Product p ON p.id = po.productId
       WHERE po.storeId = ?
       ORDER BY po.createdAt DESC
       LIMIT 100`,
      [storeId],
    ).catch(async () =>
      query(`SELECT * FROM ProductionOrder WHERE storeId = ? ORDER BY createdAt DESC LIMIT 100`, [storeId]),
    ),
    query(
      `SELECT b.*, p.name AS materialName
       FROM BillOfMaterials b
       LEFT JOIN Product p ON p.id = b.materialId
       WHERE b.storeId = ?
       ORDER BY b.productId, b.id`,
      [storeId],
    ).catch(async () =>
      query(`SELECT * FROM BillOfMaterials WHERE storeId = ? ORDER BY productId`, [storeId]),
    ),
    query(
      `SELECT id, name, sku, stock, cost FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId],
    ),
  ])

  const currency: string = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ProductionOrderClient
        storeId={storeId}
        currency={currency}
        initialOrders={ordersRaw as any[]}
        initialBOM={bomRaw as any[]}
        products={productsRaw as any[]}
      />
    </main>
  )
}
