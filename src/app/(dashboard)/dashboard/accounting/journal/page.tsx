import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import JournalPageClient from '@/components/accounting/JournalPageClient'

export default async function JournalPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <JournalPageClient storeId={store.id} currency={store.currency ?? 'USD'} />
}
