import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { ReportsPageClient } from '@/components/reports/ReportsPageClient'

export const runtime = 'edge'

export default async function ReportsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const storeRef = session.user.stores?.[0]

  if (!storeRef) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-800 bg-red-950 text-red-300 p-4 text-sm">
          No store found. Please contact your administrator.
        </div>
      </div>
    )
  }

  // Session only carries id+name; fetch currency+taxRate from DB
  const store = await prisma.store.findUnique({
    where: { id: storeRef.id },
    select: { id: true, currency: true, taxRate: true },
  })

  if (!store) {
    redirect('/login')
  }

  return (
    <ReportsPageClient
      storeId={store.id}
      currency={store.currency}
      taxRate={store.taxRate}
    />
  )
}
