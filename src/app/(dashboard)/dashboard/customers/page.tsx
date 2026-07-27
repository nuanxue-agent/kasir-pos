import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { CustomersPageClient } from '@/components/customers/CustomersPageClient'

export default async function CustomersPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  const userRole = user.stores?.[0]?.role ?? user.role ?? 'CASHIER'

  return <CustomersPageClient storeId={storeId} currency={currency} userRole={userRole} />
}
