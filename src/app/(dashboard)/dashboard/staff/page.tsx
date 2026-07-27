import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import StaffPageClient from '@/components/staff/StaffPageClient'

export default async function StaffPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  return <StaffPageClient storeId={storeId} />
}
