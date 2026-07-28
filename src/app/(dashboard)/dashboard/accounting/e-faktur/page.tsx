import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import EFakturClient from '@/components/accounting/EFakturClient'

export const metadata = { title: 'e-Faktur — Akuntansi' }

export default async function EFakturPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <EFakturClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
