import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { OrdersPageClient } from '@/components/orders/OrdersPageClient'

export default async function OrdersPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  const taxRate = user.stores?.[0]?.taxRate ?? 0

  return <OrdersPageClient storeId={storeId} currency={currency} taxRate={taxRate} />
}
