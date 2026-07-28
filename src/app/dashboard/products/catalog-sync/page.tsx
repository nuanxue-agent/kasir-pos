import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import CatalogSyncClient from '@/components/products/CatalogSyncClient'

export const metadata = { title: 'Katalog Sinkronisasi — Produk' }

async function ensureCatalogSyncTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CatalogSync (
      id             TEXT PRIMARY KEY,
      storeId        TEXT NOT NULL,
      externalSource TEXT NOT NULL DEFAULT 'MANUAL',
      externalId     TEXT NOT NULL,
      productId      TEXT NOT NULL,
      lastSyncAt     TEXT,
      active         INTEGER NOT NULL DEFAULT 1,
      createdAt      TEXT NOT NULL
    )
  `)
}

export default async function CatalogSyncPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await ensureCatalogSyncTable()

  const [mappingsRaw, productsRaw, skusRaw] = await Promise.all([
    query(
      `SELECT cs.*, p.name AS productName, p.sku AS productSku
       FROM CatalogSync cs
       LEFT JOIN Product p ON p.id = cs.productId
       WHERE cs.storeId = ?
       ORDER BY cs.createdAt DESC`,
      [storeId],
    ),
    query(
      `SELECT id, name, sku, price FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId],
    ),
    query(
      `SELECT sku FROM Product WHERE storeId = ? AND sku IS NOT NULL AND sku != ''`,
      [storeId],
    ),
  ])

  const mappings = (mappingsRaw as any[]).map(r => ({ ...r, active: Boolean(r.active) }))
  const products = productsRaw as any[]
  const existingSKUs = new Set<string>((skusRaw as any[]).map(r => r.sku as string))

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <CatalogSyncClient
        storeId={storeId}
        initialMappings={mappings}
        products={products}
        existingSKUs={existingSKUs}
      />
    </main>
  )
}
