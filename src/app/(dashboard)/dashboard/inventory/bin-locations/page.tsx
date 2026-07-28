import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import BinLocationClient from '@/components/inventory/BinLocationClient'

export const metadata = { title: 'Lokasi Bin — Inventori' }

export default async function BinLocationsPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  return <BinLocationClient storeId={storeId} />
}
