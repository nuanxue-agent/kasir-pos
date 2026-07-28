import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import WarehouseClient from '@/components/inventory/WarehouseClient'

export const metadata = { title: 'Manajemen Gudang' }

export default async function WarehousesPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <WarehouseClient storeId={storeId} />
    </div>
  )
}
