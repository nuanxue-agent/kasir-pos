import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FinancialRatiosClient from '@/components/reports/FinancialRatiosClient'

export const metadata = { title: 'Financial Ratios — Reports' }

export default async function FinancialRatiosPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  const currency: string = user.stores?.[0]?.currency ?? 'IDR'
  if (!storeId) redirect('/dashboard')

  return <FinancialRatiosClient storeId={storeId} currency={currency} />
}
