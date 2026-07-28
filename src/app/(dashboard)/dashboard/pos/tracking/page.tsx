import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import OrderTrackingClient from '@/components/pos/OrderTrackingClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Pelacakan Pesanan' }

export default async function OrderTrackingPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <Suspense fallback={<PageSkeleton />}>
      <OrderTrackingClient storeId={storeId} currency={currency} />
    </Suspense>
  )
}
