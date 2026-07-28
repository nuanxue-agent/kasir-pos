import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { StoreComparisonClient } from '@/components/reports/StoreComparisonClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default async function StoreComparisonPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const stores: Array<{ id: string; name: string }> = (user.stores ?? []).map((s: any) => ({
    id: s.id,
    name: s.name ?? s.id,
  }))
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StoreComparisonClient availableStores={stores} currency={currency} />
    </Suspense>
  )
}
