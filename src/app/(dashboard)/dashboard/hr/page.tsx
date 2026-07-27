import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import HRPageClient from '@/components/hr/HRPageClient'

export default async function HRPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <HRPageClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
