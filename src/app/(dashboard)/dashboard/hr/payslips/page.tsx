import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PayslipClient from '@/components/hr/PayslipClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default async function PayslipsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PayslipClient
        storeId={store.id}
        currency={store.currency ?? 'IDR'}
        userRole={user.role}
      />
    </Suspense>
  )
}
