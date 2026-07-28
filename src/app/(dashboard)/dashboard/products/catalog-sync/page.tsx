import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import CatalogSyncClient from '@/components/products/CatalogSyncClient'

export const metadata = { title: 'Catalog Sync | Kasir' }

export default async function CatalogSyncPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''

  // Load existing sync mappings
  let mappings: any[] = []
  let products: any[] = []
  let existingSKUs: string[] = []

  if (storeId) {
    try {
      const [mappingRows, productRows] = await Promise.all([
        query(
          `SELECT cs.*, p.name AS productName, p.sku AS productSku
           FROM CatalogSync cs
           LEFT JOIN Product p ON p.id = cs.productId
           WHERE cs.storeId = ?
           ORDER BY cs.createdAt DESC
           LIMIT 200`,
          [storeId],
        ).catch(() => []),
        query(
          `SELECT id, name, sku, price FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC LIMIT 500`,
          [storeId],
        ).catch(() => []),
      ])
      mappings = (mappingRows as any[]).map(r => ({ ...r, active: Boolean(r.active) }))
      products = productRows as any[]
      existingSKUs = (productRows as any[]).map((p: any) => p.sku).filter(Boolean)
    } catch {
      // Tables may not exist yet — client handles gracefully
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-fg)]">Catalog Sync</h1>
        <p className="text-sm text-[var(--color-fg-muted)] mt-1">
          Import, export, dan sinkronisasi produk dengan platform eksternal.
        </p>
      </div>
      <CatalogSyncClient
        storeId={storeId}
        initialMappings={mappings}
        products={products}
        existingSKUs={new Set(existingSKUs)}
      />
    </div>
  )
}
