import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'
import ReorderClient from '@/components/inventory/ReorderClient'

export const metadata = { title: 'Reorder Points — Inventory' }

export default async function ReorderPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS ReorderRule (
    id                TEXT PRIMARY KEY,
    storeId           TEXT NOT NULL,
    productId         TEXT NOT NULL,
    reorderPoint      REAL NOT NULL DEFAULT 0,
    reorderQty        REAL NOT NULL DEFAULT 0,
    leadTimeDays      INTEGER NOT NULL DEFAULT 0,
    preferredVendorId TEXT,
    active            INTEGER NOT NULL DEFAULT 1,
    createdAt         TEXT NOT NULL,
    updatedAt         TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS ReorderSuggestion (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    productId     TEXT NOT NULL,
    currentStock  REAL NOT NULL DEFAULT 0,
    reorderPoint  REAL NOT NULL DEFAULT 0,
    suggestedQty  REAL NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)

  const [rulesRaw, suggestionsRaw, productsRaw, vendorsRaw] = await Promise.all([
    query(`
      SELECT rr.*, p.name AS productName, p.sku, p.stock AS currentStock, v.name AS vendorName
      FROM ReorderRule rr
      LEFT JOIN Product p ON rr.productId = p.id
      LEFT JOIN Vendor v ON rr.preferredVendorId = v.id
      WHERE rr.storeId = ?
      ORDER BY p.name ASC
    `, [storeId]),
    query(`
      SELECT rs.*, p.name AS productName, p.sku, p.unit,
             rr.leadTimeDays, rr.preferredVendorId, v.name AS vendorName
      FROM ReorderSuggestion rs
      LEFT JOIN Product p ON rs.productId = p.id
      LEFT JOIN ReorderRule rr ON rr.storeId = rs.storeId AND rr.productId = rs.productId
      LEFT JOIN Vendor v ON rr.preferredVendorId = v.id
      WHERE rs.storeId = ? AND rs.status IN ('PENDING','APPROVED')
      ORDER BY rs.createdAt DESC
    `, [storeId]),
    query(
      `SELECT id, name, sku, stock, unit FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId]
    ),
    query(
      `SELECT id, name FROM Vendor WHERE storeId = ? ORDER BY name ASC`,
      [storeId]
    ).catch(() => []),
  ])

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--text-3)]">Memuat…</div>}>
      <ReorderClient
        storeId={storeId}
        currency={currency}
        initialRules={rulesRaw as any[]}
        initialSuggestions={suggestionsRaw as any[]}
        products={productsRaw as any[]}
        vendors={vendorsRaw as any[]}
      />
    </Suspense>
  )
}
