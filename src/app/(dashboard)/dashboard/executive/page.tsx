import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ExecutiveSummaryClient from '@/components/dashboard/ExecutiveSummaryClient'

export const metadata = { title: 'Ringkasan Eksekutif — Dashboard' }

export default async function ExecutiveSummaryPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  const currency: string = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-screen-xl px-4 py-8">
      <ExecutiveSummaryClient storeId={storeId} currency={currency} />
    </main>
  )
}
