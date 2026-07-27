import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PurchaseOrdersPageClient from '@/components/purchase-orders/PurchaseOrdersPageClient'

export default async function PurchaseOrdersPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return (
    <PurchaseOrdersPageClient
      storeId={store.id}
      currency={store.currency ?? 'IDR'}
      taxRate={store.taxRate ?? 0}
    />
  )
}
