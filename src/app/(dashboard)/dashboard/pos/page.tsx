import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, queryOne } from '@/lib/db'
import POSPageClient from '@/components/pos/POSPageClient'

export default async function POSPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const store = user.stores?.[0]
  const storeId = store?.id ?? ''
  const taxRate = store?.taxRate ?? 0
  const currency = store?.currency ?? 'IDR'
  const storeName = store?.name ?? 'Store'

  // Fetch store settings for receiptNote (not stored in session JWT)
  const storeSettings = storeId
    ? await queryOne(`SELECT receiptNote FROM Store WHERE id = ?`, [storeId])
    : null
  const receiptNote: string | null = (storeSettings as any)?.receiptNote ?? null

  // Pre-fetch products, categories, and bundles server-side
  const [products, categories, bundleRows] = await Promise.all([
    query(
      `SELECT p.*, c.name as categoryName, c.color as categoryColor, c.icon as categoryIcon
       FROM Product p LEFT JOIN Category c ON p.categoryId = c.id
       WHERE p.storeId = ? AND p.active = 1 ORDER BY p.name`,
      [storeId]
    ),
    query(
      `SELECT * FROM Category WHERE storeId = ? AND active = 1 ORDER BY sortOrder`,
      [storeId]
    ),
    query(
      `SELECT b.id, b.name, b.price, bi.productId, bi.qty
       FROM ProductBundle b
       JOIN BundleItem bi ON bi.bundleId = b.id
       WHERE b.storeId = ? AND b.active = 1
       ORDER BY b.name`,
      [storeId]
    ).catch(() => []), // graceful if table doesn't exist yet
  ])

  // Shape products for POS
  const shaped = products.map((p: any) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    cost: p.cost,
    stock: p.stock,
    trackStock: p.trackStock === 1,
    sku: p.sku,
    image: null,
    variants: [],
    category: p.categoryId ? {
      id: p.categoryId,
      name: p.categoryName,
      color: p.categoryColor,
      icon: p.categoryIcon,
    } : null,
  }))

  // Shape bundles: group rows by bundle id, attach component products
  const productMap = Object.fromEntries(shaped.map((p: any) => [p.id, p]))
  const bundleMap: Record<string, any> = {}
  for (const row of bundleRows as any[]) {
    if (!bundleMap[row.id]) {
      bundleMap[row.id] = { id: row.id, name: row.name, price: row.price, items: [] }
    }
    bundleMap[row.id].items.push({
      productId: row.productId,
      qty: row.qty,
      product: productMap[row.productId] ?? null,
    })
  }
  const bundles = Object.values(bundleMap)

  return (
    <POSPageClient
      storeId={storeId}
      storeName={storeName}
      taxRate={taxRate}
      currency={currency}
      staffId={user.id}
      initialProducts={shaped}
      categories={categories as any}
      receiptNote={receiptNote}
      initialBundles={bundles as any}
    />
  )
}
