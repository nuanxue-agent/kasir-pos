import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import LandedCostClient from '@/components/inventory/LandedCostClient'

export const metadata = { title: 'Landed Costs — Inventory' }

export default async function LandedCostsPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS LandedCost (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    poId TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'FREIGHT',
    amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'IDR',
    allocationMethod TEXT NOT NULL DEFAULT 'BY_VALUE',
    status TEXT NOT NULL DEFAULT 'DRAFT',
    createdAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS LandedCostAllocation (
    id TEXT PRIMARY KEY,
    landedCostId TEXT NOT NULL,
    storeId TEXT NOT NULL,
    productId TEXT NOT NULL,
    poItemId TEXT NOT NULL,
    allocatedAmount REAL NOT NULL DEFAULT 0,
    newUnitCost REAL NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  )`)

  const [landedCostsRaw, posRaw] = await Promise.all([
    query(
      `SELECT lc.*, po.poNumber
       FROM LandedCost lc
       LEFT JOIN PurchaseOrder po ON po.id = lc.poId
       WHERE lc.storeId = ?
       ORDER BY lc.createdAt DESC`,
      [storeId],
    ).catch(() =>
      query(`SELECT * FROM LandedCost WHERE storeId = ? ORDER BY createdAt DESC`, [storeId]),
    ),
    query(
      `SELECT id, poNumber FROM PurchaseOrder WHERE storeId = ? ORDER BY createdAt DESC`,
      [storeId],
    ).catch(() => []),
  ])

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <LandedCostClient
        storeId={storeId}
        currency={currency}
        initialLandedCosts={landedCostsRaw as any[]}
        purchaseOrders={posRaw as any[]}
      />
    </main>
  )
}
