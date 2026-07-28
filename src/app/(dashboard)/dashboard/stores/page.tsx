import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { queryOne } from '@/lib/db'
import StoresPageClient from '@/components/stores/StoresPageClient'

export default async function StoresPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''

  const store = await queryOne<any>(
    `SELECT id, name, address, phone, email, taxRate, currency, timezone, receiptNote
     FROM Store WHERE id = ?`,
    [storeId],
  )

  return <StoresPageClient storeId={storeId} initialStore={store ?? null} />
}
