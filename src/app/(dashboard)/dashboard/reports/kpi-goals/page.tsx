import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { KpiGoalsClient } from '@/components/reports/KpiGoalsClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = {
  title: 'Target KPI',
  description: 'Pantau dan kelola target KPI bisnis per periode',
}

export default async function KpiGoalsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  return (
    <Suspense fallback={<PageSkeleton />}>
      <KpiGoalsClient storeId={storeId} currency={currency} />
    </Suspense>
  )
}
