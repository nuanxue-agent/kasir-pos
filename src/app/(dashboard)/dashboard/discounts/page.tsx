import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DiscountsPageClient from '@/components/discounts/DiscountsPageClient'


export default async function DiscountsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const storeId = (session.user as any).stores?.[0]?.id ?? ''
  const currency = (session.user as any).stores?.[0]?.currency ?? 'IDR'
  return <DiscountsPageClient storeId={storeId} session={session} currency={currency} />
}
