import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import StockOpnameClient from '@/components/inventory/StockOpnameClient'

export default async function StockOpnamePage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''

  return <StockOpnameClient storeId={storeId} />
}
