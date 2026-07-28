import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import PettyCashClient from '@/components/accounting/PettyCashClient'

export const metadata = { title: 'Kas Kecil — Akuntansi' }

export default async function PettyCashPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy-init tables on first page load
  await exec(`CREATE TABLE IF NOT EXISTS PettyCashFund2 (
    id              TEXT PRIMARY KEY,
    storeId         TEXT NOT NULL,
    name            TEXT NOT NULL,
    balance         REAL NOT NULL DEFAULT 0,
    replenishAmount REAL NOT NULL DEFAULT 1000000,
    custodian       TEXT NOT NULL DEFAULT '',
    active          INTEGER NOT NULL DEFAULT 1,
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS PettyCashTransaction2 (
    id          TEXT PRIMARY KEY,
    fundId      TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'EXPENSE',
    amount      REAL NOT NULL DEFAULT 0,
    balance     REAL NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    category    TEXT NOT NULL DEFAULT 'Umum',
    receiptNo   TEXT NOT NULL DEFAULT '',
    requestedBy TEXT NOT NULL DEFAULT '',
    approvedBy  TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'APPROVED',
    createdAt   TEXT NOT NULL
  )`)

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PettyCashClient storeId={storeId} currency={currency} />
    </main>
  )
}
