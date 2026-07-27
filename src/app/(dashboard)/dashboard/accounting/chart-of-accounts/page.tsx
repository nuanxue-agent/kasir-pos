import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ChartOfAccountsClient from '@/components/accounting/ChartOfAccountsClient'

export default async function ChartOfAccountsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <ChartOfAccountsClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
