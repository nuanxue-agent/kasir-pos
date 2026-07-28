import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SupplierInvoiceClient from '@/components/accounting/SupplierInvoiceClient'

export default async function SupplierInvoicesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <SupplierInvoiceClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
