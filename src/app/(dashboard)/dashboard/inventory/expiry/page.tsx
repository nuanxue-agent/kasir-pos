import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ExpiryTrackingClient from '@/components/inventory/ExpiryTrackingClient'

export const metadata = { title: 'Pelacakan Kadaluarsa' }

export default async function ExpiryTrackingPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <ExpiryTrackingClient storeId={storeId} />
    </div>
  )
}
