import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ReportSchedulerClient from '@/components/reports/ReportSchedulerClient'

export const metadata = { title: 'Scheduled Reports' }

export default async function ScheduledReportsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.activeStoreId ?? user.stores?.[0]?.id ?? ''
  return (
    <div className="mx-auto max-w-screen-lg space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <ReportSchedulerClient storeId={storeId} />
    </div>
  )
}
