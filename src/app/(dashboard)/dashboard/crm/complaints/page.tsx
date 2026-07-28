import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ComplaintClient from '@/components/crm/ComplaintClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Keluhan Pelanggan — CRM' }

export default async function ComplaintsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComplaintClient storeId={store.id} currency={store.currency ?? 'IDR'} />
    </Suspense>
  )
}
