import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import RewardRedemptionClient from '@/components/crm/RewardRedemptionClient'

export const metadata = { title: 'Reward Pelanggan | Kasir App' }

export default async function RewardRedemptionPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <RewardRedemptionClient storeId={storeId} />
    </div>
  )
}
