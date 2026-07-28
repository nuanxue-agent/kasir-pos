import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CashFlowStatementClient from '@/components/accounting/CashFlowStatementClient'

export const metadata = { title: 'Laporan Arus Kas — Akuntansi' }

export default async function CashFlowStatementPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  return (
    <CashFlowStatementClient
      storeId={store.id}
      currency={store.currency ?? 'IDR'}
    />
  )
}
