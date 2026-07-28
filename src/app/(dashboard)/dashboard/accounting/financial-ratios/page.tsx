import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import FinancialRatioClient from '@/components/accounting/FinancialRatioClient'

export const metadata = { title: 'Analisis Rasio Keuangan — Akuntansi' }

export default async function FinancialRatiosPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS FinancialSnapshot (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    period TEXT NOT NULL,
    totalAssets REAL NOT NULL DEFAULT 0,
    currentAssets REAL NOT NULL DEFAULT 0,
    currentLiabilities REAL NOT NULL DEFAULT 0,
    inventory REAL NOT NULL DEFAULT 0,
    revenue REAL NOT NULL DEFAULT 0,
    grossProfit REAL NOT NULL DEFAULT 0,
    netProfit REAL NOT NULL DEFAULT 0,
    equity REAL NOT NULL DEFAULT 0,
    receivables REAL NOT NULL DEFAULT 0,
    computedAt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <FinancialRatioClient
        storeId={store.id}
        currency={store.currency ?? 'IDR'}
      />
    </main>
  )
}
