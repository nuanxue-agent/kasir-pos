import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import ProductsPageClient from '@/components/products/ProductsPageClient'

export default async function ProductsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'

  const [products, categories] = await Promise.all([
    query(
      `SELECT p.*, c.name as categoryName, c.color as categoryColor
       FROM Product p LEFT JOIN Category c ON p.categoryId = c.id
       WHERE p.storeId = ? AND p.active = 1 ORDER BY p.name`,
      [storeId]
    ),
    query(`SELECT * FROM Category WHERE storeId = ? AND active = 1 ORDER BY sortOrder`, [storeId]),
  ])

  return (
    <ProductsPageClient
      storeId={storeId}
      currency={currency}
      initialProducts={products as any}
      categories={categories as any}
    />
  )
}
