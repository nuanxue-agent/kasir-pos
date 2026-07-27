import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ExpensesPageClient from '@/components/expenses/ExpensesPageClient'

export default async function ExpensesPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  return <ExpensesPageClient storeId={storeId} currency={currency} />
}
