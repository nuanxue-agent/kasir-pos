import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import RecruitmentClient from '@/components/hr/RecruitmentClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Rekrutmen — HR' }

export default async function RecruitmentPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  return (
    <Suspense fallback={<PageSkeleton />}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <RecruitmentClient storeId={store.id} />
      </div>
    </Suspense>
  )
}
