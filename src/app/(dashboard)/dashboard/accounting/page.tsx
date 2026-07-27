import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AccountingPageClient from '@/components/accounting/AccountingPageClient'

export default async function AccountingPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <AccountingPageClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
