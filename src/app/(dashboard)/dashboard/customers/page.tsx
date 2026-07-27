import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CustomersPageClient from '@/components/customers/CustomersPageClient'


export default async function CustomersPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const storeId = (session.user as any).stores?.[0]?.id ?? ''
  const currency = (session.user as any).stores?.[0]?.currency ?? 'IDR'
  return <CustomersPageClient storeId={storeId} session={session} currency={currency} />
}
