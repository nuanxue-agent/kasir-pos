import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import LeaderboardClient from '@/components/crm/LeaderboardClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Leaderboard — CRM' }

export default async function LeaderboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LeaderboardClient storeId={store.id} currency={store.currency ?? 'IDR'} />
    </Suspense>
  )
}
