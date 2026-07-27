import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ProductAnalyticsClient } from '@/components/reports/ProductAnalyticsClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = {
  title: 'Product Analytics',
  description: 'ABC analysis, Pareto chart and product turnover metrics',
}

export default async function ProductAnalyticsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductAnalyticsClient storeId={storeId} currency={currency} />
    </Suspense>
  )
}
