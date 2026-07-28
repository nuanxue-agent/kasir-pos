import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import BirthdayAutomationClient from '@/components/crm/BirthdayAutomationClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Birthday & Anniversary Automation — CRM' }

export default async function BirthdayAutomationPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Suspense fallback={<PageSkeleton />}>
        <BirthdayAutomationClient storeId={store.id} currency={store.currency ?? 'IDR'} />
      </Suspense>
    </main>
  )
}
