import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CustomersPageClient } from '@/components/customers/CustomersPageClient'

export const metadata = { title: 'Customers' }

export default async function CustomersPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const stores = session.user.stores ?? []
  const storeId = stores[0]?.id ?? null

  if (!storeId) {
    return (
      <div className="p-6 text-center text-slate-400">
        No store found. Please set up a store first.
      </div>
    )
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { currency: true },
  })

  return (
    <CustomersPageClient
      storeId={storeId}
      currency={store?.currency ?? 'IDR'}
    />
  )
}
