import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, queryOne } from '@/lib/db'
import SettingsPageClient from '@/components/settings/SettingsPageClient'
import { LoyaltySettingsClient } from '@/components/settings/LoyaltySettingsClient'
import { GiftCardsClient } from '@/components/settings/GiftCardsClient'

export default async function SettingsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''

  const store = await queryOne<any>(
    `SELECT name, address, phone, email, taxRate, currency, receiptNote, timezone,
            COALESCE(modules, '["pos","inventory","customers","discounts","reports"]') as modules
     FROM Store WHERE id = ?`,
    [storeId],
  )

  const modules = (() => {
    try {
      return JSON.parse(store?.modules ?? '[]')
    } catch {
      return ['pos', 'inventory', 'customers', 'discounts', 'reports']
    }
  })()

  return (
    <div className="space-y-8">
      <SettingsPageClient
        storeId={storeId}
        store={{
          ...(store ?? { name: '', taxRate: 0, currency: 'IDR', timezone: 'Asia/Jakarta' }),
          modules,
        }}
      />
      <div className="mx-auto max-w-2xl px-4 pb-8 sm:px-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <LoyaltySettingsClient storeId={storeId} />
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 pb-8 sm:px-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <GiftCardsClient storeId={storeId} currency={store?.currency ?? 'IDR'} />
        </div>
      </div>
    </div>
  )
}
