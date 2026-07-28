import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ReservationClient from '@/components/pos/ReservationClient'

export const metadata = { title: 'Reservasi & Antrean' }

export default async function ReservationsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''

  return <ReservationClient storeId={storeId} />
}
