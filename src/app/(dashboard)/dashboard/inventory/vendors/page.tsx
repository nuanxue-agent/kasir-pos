import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import VendorPortalClient from '@/components/inventory/VendorPortalClient'

export const metadata = { title: 'Portal Vendor' }

export default async function VendorPortalPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const userRole = user.stores?.[0]?.role ?? 'CASHIER'

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <VendorPortalClient storeId={storeId} userRole={userRole} />
    </div>
  )
}
