import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TierProgressClient } from '@/components/loyalty/TierProgressClient'

export const metadata = { title: 'Loyalty Tier Progress' }

export default async function TierProgressPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return <TierProgressClient storeId={storeId} currency={currency} />
}
