import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import InvoiceClient from '@/components/invoices/InvoiceClient'

export default async function InvoicesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <InvoiceClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
