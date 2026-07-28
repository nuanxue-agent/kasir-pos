import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FixedAssetClient from '@/components/accounting/FixedAssetClient'

export const metadata = { title: 'Aset Tetap — Akuntansi' }

export default async function FixedAssetsPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  return (
    <FixedAssetClient
      storeId={store.id}
      currency={store.currency ?? 'IDR'}
    />
  )
}
