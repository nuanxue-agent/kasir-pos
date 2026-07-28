import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CampaignSchedulerClient from '@/components/crm/CampaignSchedulerClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Penjadwalan Kampanye — CRM' }

export default async function CampaignSchedulerPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  return (
    <Suspense fallback={<PageSkeleton />}>
      <CampaignSchedulerClient storeId={store.id} />
    </Suspense>
  )
}
