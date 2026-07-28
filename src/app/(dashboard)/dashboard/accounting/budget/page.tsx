import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import BudgetClient from '@/components/accounting/BudgetClient'

export default async function BudgetPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <BudgetClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
