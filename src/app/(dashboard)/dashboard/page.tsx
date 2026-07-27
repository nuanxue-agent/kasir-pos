import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'


export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const storeId = (session.user as any).stores?.[0]?.id
  if (!storeId) redirect('/login')

  // Data is fetched client-side via React Query
  return <DashboardClientPage storeId={storeId} session={session} />
}

// Import client component
import DashboardClientPage from '@/components/dashboard/DashboardClientPage'
