import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CRMPageClient from '@/components/crm/CRMPageClient'

export default async function CRMPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <CRMPageClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
