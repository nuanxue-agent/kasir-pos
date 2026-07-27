import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import InventoryPageClient from '@/components/inventory/InventoryPageClient'

export const runtime = 'edge'

export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const storeId = session.user.stores?.[0]?.id
  if (!storeId) redirect('/dashboard')

  return <InventoryPageClient storeId={storeId} />
}
