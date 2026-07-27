import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { StaffPerformanceClient } from '@/components/reports/StaffPerformanceClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default async function StaffReportPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StaffPerformanceClient storeId={storeId} currency={currency} />
    </Suspense>
  )
}
