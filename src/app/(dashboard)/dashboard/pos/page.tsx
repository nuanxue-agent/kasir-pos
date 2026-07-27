import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import POSPageClient from '@/components/pos/POSPageClient'

export const dynamic = 'force-dynamic'

export default async function POSPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const storeId = session.user.stores?.[0]?.id
  if (!storeId) redirect('/dashboard')

  const [store, products, categories] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId } }),
    prisma.product.findMany({
      where: { storeId, active: true },
      include: {
        category: true,
        variants: { where: { active: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany({
      where: { storeId, active: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  if (!store) redirect('/dashboard')

  return (
    <POSPageClient
      storeId={store.id}
      taxRate={store.taxRate}
      currency={store.currency}
      staffId={session.user.id}
      initialProducts={products}
      categories={categories}
    />
  )
}
