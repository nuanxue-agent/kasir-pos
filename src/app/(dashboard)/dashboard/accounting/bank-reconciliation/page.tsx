import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import BankReconciliationClient from '@/components/accounting/BankReconciliationClient'

export default async function BankReconciliationPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <BankReconciliationClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
