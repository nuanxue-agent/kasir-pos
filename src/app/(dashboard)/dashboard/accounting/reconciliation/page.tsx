import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ReconciliationClient from '@/components/accounting/ReconciliationClient'

export default async function ReconciliationPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <ReconciliationClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
