import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PerformanceReviewClient from '@/components/hr/PerformanceReviewClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default async function PerformanceReviewPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  return (
    <Suspense fallback={<PageSkeleton />}>
      <PerformanceReviewClient
        storeId={store.id}
        userRole={user.role}
      />
    </Suspense>
  )
}
