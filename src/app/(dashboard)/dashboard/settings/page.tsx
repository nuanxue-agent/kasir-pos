import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, queryOne } from '@/lib/db'
import SettingsPageClient from '@/components/settings/SettingsPageClient'

export default async function SettingsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''

  const store = await queryOne<any>(
    `SELECT name, address, phone, email, taxRate, currency, receiptNote, timezone FROM Store WHERE id = ?`,
    [storeId]
  )

  return (
    <SettingsPageClient
      storeId={storeId}
      store={store ?? {
        name: '', taxRate: 0, currency: 'IDR', timezone: 'Asia/Jakarta',
      }}
    />
  )
}
