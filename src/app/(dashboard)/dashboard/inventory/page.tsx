import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import InventoryPageClient from '@/components/inventory/InventoryPageClient'

export default async function InventoryPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''

  return <InventoryPageClient storeId={storeId} />
}
