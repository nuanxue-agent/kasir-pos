import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ReportsPageClient } from '@/components/reports/ReportsPageClient'

export default async function ReportsPage() {
  const session = await auth()
  
  if (!session?.user) {
    redirect('/login')
  }

  // Get the first store from user's stores
  const store = session.user.stores?.[0]
  
  if (!store) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4">
          No store found. Please contact your administrator.
        </div>
      </div>
    )
  }

  return (
    <ReportsPageClient
      storeId={store.id}
      currency={store.currency}
      taxRate={store.taxRate}
    />
  )
}
