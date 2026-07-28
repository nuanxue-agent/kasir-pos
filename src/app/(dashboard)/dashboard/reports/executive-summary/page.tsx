import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ExecutiveSummaryClient from '@/components/reports/ExecutiveSummaryClient'

export const metadata = { title: 'Executive Summary — Reports' }

export default async function ExecutiveSummaryPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  const currency: string = user.stores?.[0]?.currency ?? 'IDR'
  if (!storeId) redirect('/dashboard')

  return <ExecutiveSummaryClient storeId={storeId} currency={currency} />
}
