import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MarginAnalysisClient from '@/components/reports/MarginAnalysisClient'

export const metadata = { title: 'Margin Analysis — Reports' }

export default async function MarginAnalysisPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  const currency: string = user.stores?.[0]?.currency ?? 'IDR'
  if (!storeId) redirect('/dashboard')

  return <MarginAnalysisClient storeId={storeId} currency={currency} />
}
