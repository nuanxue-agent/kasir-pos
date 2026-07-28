import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BudgetClient } from '@/components/reports/BudgetClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = {
  title: 'Manajemen Anggaran',
  description: 'Pantau anggaran vs aktual per kategori dengan indikator traffic light',
}

export default async function BudgetControlPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BudgetClient storeId={storeId} currency={currency} />
    </Suspense>
  )
}
