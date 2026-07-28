import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import GiftCardClient from '@/components/pos/GiftCardClient'

export const metadata = { title: 'Gift Cards — POS' }

export default async function GiftCardsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const store = user.stores?.[0]
  const storeId: string = store?.id ?? ''
  const currency: string = store?.currency ?? 'IDR'

  if (!storeId) redirect('/dashboard')

  return (
    <main>
      <GiftCardClient storeId={storeId} currency={currency} />
    </main>
  )
}
