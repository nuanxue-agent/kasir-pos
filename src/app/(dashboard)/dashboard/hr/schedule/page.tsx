import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ShiftSchedulerClient from '@/components/hr/ShiftSchedulerClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default async function SchedulePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ShiftSchedulerClient storeId={store.id} userRole={user.role} />
    </Suspense>
  )
}
