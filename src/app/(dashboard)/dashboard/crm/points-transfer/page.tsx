import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PointsTransferClient from '@/components/crm/PointsTransferClient'

export const metadata = { title: 'Transfer Poin Loyalitas | Kasir App' }

export default async function PointsTransferPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PointsTransferClient storeId={storeId} />
    </div>
  )
}
