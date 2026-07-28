import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import CostAccountingClient from '@/components/accounting/CostAccountingClient'

export const metadata = { title: 'Akuntansi Biaya — Akuntansi' }

export default async function CostAccountingPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS ProductCost (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    productId    TEXT NOT NULL,
    materialCost REAL NOT NULL DEFAULT 0,
    laborCost    REAL NOT NULL DEFAULT 0,
    overheadCost REAL NOT NULL DEFAULT 0,
    totalCost    REAL NOT NULL DEFAULT 0,
    effectiveDate TEXT NOT NULL,
    notes        TEXT,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS CostCenter (
    id         TEXT PRIMARY KEY,
    storeId    TEXT NOT NULL,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'OVERHEAD',
    budget     REAL NOT NULL DEFAULT 0,
    actualCost REAL NOT NULL DEFAULT 0,
    period     TEXT NOT NULL,
    createdAt  TEXT NOT NULL,
    updatedAt  TEXT NOT NULL
  )`)

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <CostAccountingClient
        storeId={store.id}
        currency={store.currency ?? 'IDR'}
      />
    </main>
  )
}
