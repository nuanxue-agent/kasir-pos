import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PnLClient } from '@/components/reports/PnLClient'

export default async function PnLPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  return <PnLClient storeId={storeId} currency={currency} />
}
