import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import VariantsPageClient from '@/components/variants/VariantsPageClient'

export default async function VariantsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  return <VariantsPageClient storeId={storeId} currency={currency} />
}
