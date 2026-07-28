import { OrderTrackingView, type OrderTrackingData } from '@/components/pos/OrderTrackingClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Status Pesanan' }

// Public route — no auth required
export default async function TrackOrderPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Optionally pre-fetch server-side for faster first paint
  let initialData: OrderTrackingData | null = null
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const res = await fetch(`${baseUrl}/api/track/${token}`, {
      next: { revalidate: 10 },
    })
    if (res.ok) {
      initialData = await res.json()
    }
  } catch {
    // fall through — client will fetch on mount
  }

  return <OrderTrackingView token={token} initialData={initialData} />
}
