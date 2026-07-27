import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import StaffPageClient from '@/components/staff/StaffPageClient'
import { isManagerOrAbove } from '@/lib/permissions'

export default async function StaffPage() {
  const session = await auth()
  if (!session) redirect('/login')

  // Only MANAGER and above can access staff page
  if (!isManagerOrAbove(session.user.role)) {
    redirect('/dashboard')
  }

  const storeId = session.user.stores?.[0]?.id
  if (!storeId) redirect('/dashboard')

  return <StaffPageClient storeId={storeId} />
}
