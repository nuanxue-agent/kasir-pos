import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import ProductsPageClient from '@/components/products/ProductsPageClient'

export const runtime = 'edge'

export default async function ProductsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const storeId = session.user.stores?.[0]?.id
  if (!storeId) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
          No store assigned. Please contact your administrator.
        </div>
      </div>
    )
  }

  // Fetch products and categories
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { storeId },
      include: { category: true },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany({
      where: { storeId },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <ProductsPageClient
      storeId={storeId}
      initialProducts={products}
      categories={categories}
      currency="IDR"
    />
  )
}
