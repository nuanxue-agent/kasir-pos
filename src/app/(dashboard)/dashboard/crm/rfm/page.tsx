import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import RFMClient from '@/components/crm/RFMClient'

export const metadata = { title: 'RFM Analysis — CRM' }

async function ensureRFMTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CustomerRFM (
      id               TEXT PRIMARY KEY,
      storeId          TEXT NOT NULL,
      customerId       TEXT NOT NULL,
      recencyDays      INTEGER NOT NULL DEFAULT 0,
      frequencyCount   INTEGER NOT NULL DEFAULT 0,
      monetaryTotal    REAL NOT NULL DEFAULT 0,
      recencyScore     INTEGER NOT NULL DEFAULT 3,
      frequencyScore   INTEGER NOT NULL DEFAULT 3,
      monetaryScore    INTEGER NOT NULL DEFAULT 3,
      rfmScore         INTEGER NOT NULL DEFAULT 9,
      segment          TEXT NOT NULL DEFAULT 'New',
      computedAt       TEXT NOT NULL
    )
  `).catch(() => {})
}

export default async function RFMPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  await ensureRFMTable()

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <RFMClient storeId={store.id} currency={store.currency ?? 'IDR'} />
    </main>
  )
}
