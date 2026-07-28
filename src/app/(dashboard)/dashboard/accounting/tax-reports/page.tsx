import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TaxReportClient from '@/components/accounting/TaxReportClient'

export const metadata = { title: 'Laporan Pajak — Akuntansi' }

export default async function TaxReportsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return <TaxReportClient storeId={store.id} currency={store.currency ?? 'IDR'} />
}
