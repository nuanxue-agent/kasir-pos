import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import StockForecastClient from '@/components/inventory/StockForecastClient'

export const metadata = { title: 'Stock Forecast' }

export default async function StockForecastPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <StockForecastClient storeId={storeId} />
    </div>
  )
}
