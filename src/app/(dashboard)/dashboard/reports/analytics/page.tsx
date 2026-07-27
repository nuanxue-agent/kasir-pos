import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SalesAnalyticsClient } from '@/components/reports/SalesAnalyticsClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SalesAnalyticsClient storeId={storeId} currency={currency} />
    </Suspense>
  )
}
