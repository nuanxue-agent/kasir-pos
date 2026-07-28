import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import RecipeClient from '@/components/products/RecipeClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default async function RecipesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  const products = await query(
    `SELECT id, name, price, cost, stock, trackStock FROM Product WHERE storeId = ? AND active = 1 ORDER BY name`,
    [store.id],
  )

  return (
    <Suspense fallback={<PageSkeleton />}>
      <RecipeClient
        storeId={store.id}
        currency={store.currency ?? 'IDR'}
        products={products as any[]}
      />
    </Suspense>
  )
}
