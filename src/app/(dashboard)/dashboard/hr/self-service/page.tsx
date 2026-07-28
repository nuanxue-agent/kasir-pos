import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import EmployeeSelfServiceClient from '@/components/hr/EmployeeSelfServiceClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default async function SelfServicePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  // employeeId is either stored on user directly or derived from their profile
  const employeeId: string = user.employeeId ?? user.id
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EmployeeSelfServiceClient
        storeId={store.id}
        employeeId={employeeId}
        currency={store.currency ?? 'IDR'}
      />
    </Suspense>
  )
}
