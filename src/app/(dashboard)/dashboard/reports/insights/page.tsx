import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { InsightsClient } from '@/components/reports/InsightsClient'

export const metadata = {
  title: 'Business Insights',
  description: 'Deteksi anomali dan tren otomatis dari data penjualan',
}

export default async function ReportsInsightsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const storeId = user.activeStoreId ?? user.stores?.[0]?.id ?? ''

  if (!storeId) redirect('/login')

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <InsightsClient storeId={storeId} />
    </div>
  )
}
