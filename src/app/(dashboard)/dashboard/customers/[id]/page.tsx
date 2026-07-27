import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { CustomerDetailClient } from '@/components/customers/CustomerDetailClient'

interface CustomerDetail {
  id: string
  storeId: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  points: number
  tier: string | null
  totalPoints: number
  createdAt: string
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'

  const { id } = await params

  // Fetch customer server-side for initial render
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/customers/${id}?storeId=${storeId}`, {
    headers: { cookie: '' }, // SSR — auth comes from session cookie passed via next/headers
    cache: 'no-store',
  })

  if (res.status === 404) notFound()

  // If fetch fails (e.g. cold start), render client-side with empty initial data
  const initialCustomer = res.ok ? (await res.json() as CustomerDetail) : null

  return (
    <CustomerDetailClient
      customerId={id}
      storeId={storeId}
      currency={currency}
      initialCustomer={initialCustomer}
    />
  )
}
