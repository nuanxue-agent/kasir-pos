import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import BudgetPlanningClient from '@/components/accounting/BudgetPlanningClient'

export default async function BudgetPlanningPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <BudgetPlanningClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
