import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ChurnPredictionClient } from '@/components/reports/ChurnPredictionClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default async function ChurnPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ChurnPredictionClient storeId={storeId} />
    </Suspense>
  )
}
