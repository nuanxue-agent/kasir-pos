import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { OrderDetailClient } from '@/components/orders/OrderDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function OrderDetailPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  const role: string = user.stores?.[0]?.role ?? 'CASHIER'

  const { id } = await params

  return <OrderDetailClient orderId={id} storeId={storeId} currency={currency} role={role} />
}
