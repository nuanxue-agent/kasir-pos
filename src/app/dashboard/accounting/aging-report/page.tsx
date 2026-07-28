import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AgingReportClient from '@/components/accounting/AgingReportClient'

export const metadata = { title: 'Aging Report | Kasir' }

export default async function AgingReportPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  const currency: string = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <AgingReportClient storeId={storeId} currency={currency} />
    </div>
  )
}
