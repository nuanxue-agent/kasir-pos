import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DashboardClientPage from '@/components/dashboard/DashboardClientPage'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const sessionStores: Array<{ id: string; name: string; currency?: string; modules?: string[] }> =
    user.stores ?? []

  if (!sessionStores.length) redirect('/login')

  // Honour the activeStoreId persisted in the session cookie; fall back to first store
  const activeStoreId: string = user.activeStoreId ?? sessionStores[0].id
  const activeStore = sessionStores.find(s => s.id === activeStoreId) ?? sessionStores[0]

  const storeId = activeStore.id
  const modules = activeStore.modules ?? ['pos', 'inventory', 'customers', 'discounts', 'reports']

  return <DashboardClientPage storeId={storeId} session={session} modules={modules} />
}
