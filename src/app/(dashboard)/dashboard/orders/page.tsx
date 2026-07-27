import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrdersPageClient } from '@/components/orders/OrdersPageClient'

export const runtime = 'edge'

export const metadata = { title: 'Orders' }

export default async function OrdersPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const stores = session.user.stores ?? []
  const storeId = stores[0]?.id ?? null

  if (!storeId) {
    return (
      <div className="p-6 text-center text-slate-400">
        No store found. Please set up a store first.
      </div>
    )
  }

  // Get store settings for currency and tax rate
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { currency: true, taxRate: true },
  })

  return (
    <OrdersPageClient
      storeId={storeId}
      currency={store?.currency ?? 'IDR'}
      taxRate={store?.taxRate ?? 0}
    />
  )
}
