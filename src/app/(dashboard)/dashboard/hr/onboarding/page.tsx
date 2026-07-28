import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import OnboardingClient from '@/components/hr/OnboardingClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Onboarding & Offboarding — HR' }

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  return (
    <Suspense fallback={<PageSkeleton />}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <OnboardingClient storeId={store.id} />
      </div>
    </Suspense>
  )
}
