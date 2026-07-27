import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MorePageClient from '@/components/dashboard/MorePageClient'

export default async function MorePage() {
  const session = await auth()
  if (!session) redirect('/login')

  return <MorePageClient />
}
