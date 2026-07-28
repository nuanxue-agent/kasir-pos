import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import { ensureValuationTables } from '@/app/api/inventory-valuation/route'
import InventoryValuationClient from '@/components/inventory/InventoryValuationClient'

export default async function InventoryValuationPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  const storeId = user.stores?.[0]?.id
  if (!storeId) redirect('/dashboard')

  await ensureValuationTables()

  // Get active method for this store (default FIFO)
  const methodRows = await query(
    `SELECT method FROM ValuationMethod WHERE storeId = ? AND active = 1 LIMIT 1`,
    [storeId]
  ) as any[]
  const activeMethod = (methodRows[0]?.method ?? 'FIFO') as 'FIFO' | 'AVCO' | 'LIFO'

  const [layers, cogsEntries, valuation] = await Promise.all([
    query(
      `SELECT il.*, COALESCE(p.name, il.productId) AS productName
       FROM InventoryLayer il
       LEFT JOIN Product p ON p.id = il.productId
       WHERE il.storeId = ? AND il.method = ?
       ORDER BY il.receivedAt ASC
       LIMIT 500`,
      [storeId, activeMethod]
    ),
    query(
      `SELECT ce.*, COALESCE(p.name, ce.productId) AS productName
       FROM COGSEntry ce
       LEFT JOIN Product p ON p.id = ce.productId
       WHERE ce.storeId = ?
       ORDER BY ce.soldAt DESC
       LIMIT 200`,
      [storeId]
    ),
    query(
      `SELECT
         il.productId,
         COALESCE(p.name, il.productId) AS productName,
         il.method,
         SUM(il.remainingQty) AS totalQty,
         SUM(il.remainingQty * il.costPrice) AS totalValue,
         CASE WHEN SUM(il.remainingQty) > 0
              THEN SUM(il.remainingQty * il.costPrice) / SUM(il.remainingQty)
              ELSE 0 END AS avgCost
       FROM InventoryLayer il
       LEFT JOIN Product p ON p.id = il.productId
       WHERE il.storeId = ? AND il.method = ? AND il.remainingQty > 0
       GROUP BY il.productId, il.method
       ORDER BY totalValue DESC`,
      [storeId, activeMethod]
    ),
  ])

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <InventoryValuationClient
      storeId={storeId}
      currency={currency}
      initialLayers={layers as any}
      initialCOGS={cogsEntries as any}
      initialValuation={valuation as any}
      activeMethod={activeMethod}
    />
  )
}
