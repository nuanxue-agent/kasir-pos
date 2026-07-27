import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import InventoryPageClient from '@/components/inventory/InventoryPageClient'


export default async function InventoryPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const storeId = (session.user as any).stores?.[0]?.id ?? ''
  const currency = (session.user as any).stores?.[0]?.currency ?? 'IDR'
  return <InventoryPageClient storeId={storeId} session={session} currency={currency} />
}
