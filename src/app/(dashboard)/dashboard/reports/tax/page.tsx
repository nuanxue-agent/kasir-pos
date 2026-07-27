import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TaxReportClient } from '@/components/reports/TaxReportClient'

export default async function TaxReportPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  return <TaxReportClient storeId={storeId} currency={currency} />
}
