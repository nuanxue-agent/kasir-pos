import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import IntercompanyClient from '@/components/accounting/IntercompanyClient'

export const metadata = { title: 'Intercompany — Akuntansi' }

export default async function IntercompanyPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <IntercompanyClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
