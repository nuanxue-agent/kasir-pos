import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import MultiCurrencyClient from '@/components/settings/MultiCurrencyClient'

export const metadata = { title: 'Currencies — Settings' }

export default async function CurrenciesPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await exec(`CREATE TABLE IF NOT EXISTS Currency (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    code         TEXT NOT NULL,
    name         TEXT NOT NULL,
    symbol       TEXT NOT NULL,
    exchangeRate REAL NOT NULL DEFAULT 1.0,
    isBase       INTEGER NOT NULL DEFAULT 0,
    active       INTEGER NOT NULL DEFAULT 1,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ExchangeRateHistory (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    fromCurrency TEXT NOT NULL,
    toCurrency   TEXT NOT NULL,
    rate         REAL NOT NULL,
    recordedAt   TEXT NOT NULL
  )`)

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <MultiCurrencyClient storeId={storeId} baseCurrencyCode={currency} />
    </main>
  )
}
