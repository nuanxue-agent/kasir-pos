import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import KitchenDisplayClient from '@/components/pos/KitchenDisplayClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Kitchen Display System' }

export default async function KitchenDisplayPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''

  return (
    <Suspense fallback={<PageSkeleton />}>
      <KitchenDisplayClient storeId={storeId} />
    </Suspense>
  )
}
