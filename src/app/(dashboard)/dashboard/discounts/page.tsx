import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DiscountsPageClient from '@/components/discounts/DiscountsPageClient'

export default async function DiscountsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  return <DiscountsPageClient storeId={storeId} currency={currency} />
}
