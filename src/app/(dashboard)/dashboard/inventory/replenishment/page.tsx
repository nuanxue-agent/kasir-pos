import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import ReplenishmentClient from '@/components/inventory/ReplenishmentClient'
import { ensureReplenishmentTables } from '@/app/api/replenishment-configs/route'

export const metadata = { title: 'Pengadaan Cerdas — Inventory' }

export default async function ReplenishmentPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await ensureReplenishmentTables()

  const currency: string = user.stores?.[0]?.currency ?? 'IDR'

  const [configsRaw, suggestionsRaw, productsRaw, vendorsRaw] = await Promise.all([
    query(`
      SELECT rc.*, p.name AS productName, p.sku, p.stock AS currentStock, v.name AS vendorName
      FROM ReplenishmentConfig rc
      LEFT JOIN Product p ON rc.productId = p.id
      LEFT JOIN Vendor  v ON rc.vendorId   = v.id
      WHERE rc.storeId = ?
      ORDER BY p.name ASC
    `, [storeId]),

    query(`
      SELECT rs.*, p.name AS productName, p.sku, v.name AS vendorName
      FROM ReplenishmentSuggestion rs
      LEFT JOIN Product p ON rs.productId = p.id
      LEFT JOIN Vendor  v ON rs.vendorId   = v.id
      WHERE rs.storeId = ? AND rs.status = 'PENDING'
      ORDER BY
        CASE rs.urgency
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH'     THEN 2
          WHEN 'MEDIUM'   THEN 3
          ELSE 4
        END ASC,
        rs.createdAt DESC
    `, [storeId]),

    query(
      `SELECT id, name, sku, stock FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId]
    ),

    query(
      `SELECT id, name FROM Vendor WHERE storeId = ? ORDER BY name ASC`,
      [storeId]
    ).catch(() => []),
  ])

  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--text-3)]">Memuat…</div>}>
      <ReplenishmentClient
        storeId={storeId}
        currency={currency}
        initialConfigs={configsRaw as any[]}
        initialSuggestions={suggestionsRaw as any[]}
        products={productsRaw as any[]}
        vendors={vendorsRaw as any[]}
      />
    </Suspense>
  )
}
