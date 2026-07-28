import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import ProductComparisonClient from '@/components/products/ProductComparisonClient'

export const metadata = { title: 'Product Comparison — Products' }

async function ensureSpecTable() {
  await exec(`CREATE TABLE IF NOT EXISTS ProductSpec (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    productId    TEXT NOT NULL,
    specName     TEXT NOT NULL,
    specValue    TEXT NOT NULL DEFAULT '',
    specGroup    TEXT NOT NULL DEFAULT 'General',
    displayOrder INTEGER NOT NULL DEFAULT 0,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
}

export default async function ProductComparisonPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await ensureSpecTable()

  const productsRaw = await query(
    `SELECT id, name, price, cost, sku, stock, categoryId, image
     FROM Product
     WHERE storeId = ? AND (active = 1 OR active IS NULL)
     ORDER BY name ASC`,
    [storeId],
  )

  const products = productsRaw as any[]
  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <ProductComparisonClient
        storeId={storeId}
        currency={currency}
        initialProducts={products}
      />
    </main>
  )
}
