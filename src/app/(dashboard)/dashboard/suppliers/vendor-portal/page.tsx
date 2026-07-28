import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import VendorPortalClient from '@/components/suppliers/VendorPortalClient'

export const metadata = { title: 'Portal Vendor' }

export default async function VendorPortalPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return (
    <VendorPortalClient
      storeId={store.id}
      currency={store.currency ?? 'IDR'}
    />
  )
}
