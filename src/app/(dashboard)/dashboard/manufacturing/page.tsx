import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ManufacturingPageClient from '@/components/manufacturing/ManufacturingPageClient'

export default async function ManufacturingPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <ManufacturingPageClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
