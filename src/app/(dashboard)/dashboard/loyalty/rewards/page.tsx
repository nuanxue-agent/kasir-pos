import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { RewardsMarketplaceClient } from '@/components/loyalty/RewardsMarketplaceClient'

export const metadata = { title: 'Rewards Marketplace' }

export default async function RewardsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  const role = user.stores?.[0]?.role ?? 'STAFF'

  return <RewardsMarketplaceClient storeId={storeId} currency={currency} userRole={role} />
}
