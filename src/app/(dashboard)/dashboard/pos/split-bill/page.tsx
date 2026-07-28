import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SplitBillClient from '@/components/pos/SplitBillClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Split Bill & Group Order' }

export default async function SplitBillPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const store = user.stores?.[0]
  const storeId = store?.id ?? ''
  const currency = store?.currency ?? 'IDR'

  return (
    <Suspense fallback={<PageSkeleton />}>
      <SplitBillClient storeId={storeId} currency={currency} />
    </Suspense>
  )
}
