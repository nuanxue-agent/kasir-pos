import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AIInsightsClient from '@/components/reports/AIInsightsClient'

export const metadata = {
  title: 'Smart Insights',
}

export default async function InsightsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const storeId = user.activeStoreId ?? user.stores?.[0]?.id ?? ''

  if (!storeId) redirect('/login')

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <AIInsightsClient storeId={storeId} />
    </div>
  )
}
