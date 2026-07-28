import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import CashFlowForecastClient from '@/components/accounting/CashFlowForecastClient'

export const metadata = { title: 'Prakiraan Arus Kas — Akuntansi' }

export default async function CashForecastPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS CashFlowForecast (
    id               TEXT PRIMARY KEY,
    storeId          TEXT NOT NULL,
    date             TEXT NOT NULL,
    projectedInflow  REAL NOT NULL DEFAULT 0,
    projectedOutflow REAL NOT NULL DEFAULT 0,
    projectedBalance REAL NOT NULL DEFAULT 0,
    actualInflow     REAL NOT NULL DEFAULT 0,
    actualOutflow    REAL NOT NULL DEFAULT 0,
    actualBalance    REAL NOT NULL DEFAULT 0,
    notes            TEXT NOT NULL DEFAULT '',
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`)

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <CashFlowForecastClient
        storeId={store.id}
        currency={store.currency ?? 'IDR'}
      />
    </main>
  )
}
