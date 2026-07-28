import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import OrderSplitClient from '@/components/pos/OrderSplitClient'

interface PageProps {
  searchParams: Promise<{ orderId?: string; storeId?: string }>
}

export default async function SplitOrderPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const user = session.user as any
  const storeId = sp.storeId ?? user.stores?.[0]?.id
  const orderId = sp.orderId

  if (!storeId || !orderId) {
    redirect('/dashboard/pos')
  }

  // Fetch the order server-side
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const [orderRes, tableOrdersRes] = await Promise.all([
    fetch(`${baseUrl}/api/orders/${orderId}?storeId=${storeId}`, {
      cache: 'no-store',
      headers: { Cookie: '' }, // auth handled server-side via session
    }),
    fetch(`${baseUrl}/api/orders?storeId=${storeId}&status=PENDING`, {
      cache: 'no-store',
    }),
  ])

  if (!orderRes.ok) redirect('/dashboard/pos')

  const order = await orderRes.json() as any
  const tableOrdersData: any[] = tableOrdersRes.ok ? await tableOrdersRes.json() : []
  // Filter to same table, exclude current order
  const tableOrders = Array.isArray(tableOrdersData)
    ? tableOrdersData.filter(
        (o: any) => o.tableId === order.tableId && o.id !== orderId,
      )
    : []

  const store = user.stores?.find((s: any) => s.id === storeId)
  const currency = store?.currency ?? 'IDR'

  return (
    <Suspense>
      <OrderSplitClient
        order={order}
        tableOrders={tableOrders}
        storeId={storeId}
        currency={currency}
        onClose={() => {
          // Client-side redirect handled in the component when used as a modal
        }}
      />
    </Suspense>
  )
}
