import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import OrdersPageClient from '@/components/orders/OrdersPageClient'


export default async function OrdersPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const storeId = (session.user as any).stores?.[0]?.id ?? ''
  const currency = (session.user as any).stores?.[0]?.currency ?? 'IDR'
  return <OrdersPageClient storeId={storeId} session={session} currency={currency} />
}
