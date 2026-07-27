import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { GoalTrackerClient } from '@/components/reports/GoalTrackerClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = {
  title: 'Target & KPI',
  description: 'Pantau target bisnis dan KPI per periode',
}

export default async function GoalsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  return (
    <Suspense fallback={<PageSkeleton />}>
      <GoalTrackerClient storeId={storeId} currency={currency} />
    </Suspense>
  )
}
