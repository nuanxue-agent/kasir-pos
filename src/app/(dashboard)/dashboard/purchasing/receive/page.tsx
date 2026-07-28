import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import GoodsReceiptClient from '@/components/purchasing/GoodsReceiptClient'

export const metadata = { title: 'Terima Barang' }

export default async function GoodsReceiptPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')
  return (
    <GoodsReceiptClient
      storeId={store.id}
      currency={store.currency ?? 'IDR'}
    />
  )
}
