import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BudgetPlannerClient } from '@/components/reports/BudgetPlannerClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = {
  title: 'Perencanaan Anggaran',
  description: 'Atur anggaran bulanan dan pantau proyeksi arus kas',
}

export default async function BudgetPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BudgetPlannerClient storeId={storeId} currency={currency} />
    </Suspense>
  )
}
