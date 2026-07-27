import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import { FranchiseClient } from '@/components/franchise/FranchiseClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default async function FranchisePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'
  const tenantId = user.tenantId as string | undefined

  // Fetch all stores for this tenant (for transfer form)
  let stores: Array<{ id: string; name: string }> = []
  if (tenantId) {
    stores = (await query(
      `SELECT id, name FROM Store WHERE tenantId = ? AND active = 1 ORDER BY name`,
      [tenantId],
    )) as any[]
  }
  if (stores.length === 0 && storeId) {
    stores = [{ id: storeId, name: user.stores?.[0]?.name ?? 'Toko' }]
  }

  return (
    <Suspense fallback={<PageSkeleton />}>
      <FranchiseClient storeId={storeId} currency={currency} stores={stores} />
    </Suspense>
  )
}
