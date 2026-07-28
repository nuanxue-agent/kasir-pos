import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import CashDrawerClient from '@/components/pos/CashDrawerClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Laci Kasir — POS' }

export default async function CashDrawerPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  const currency: string = user.stores?.[0]?.currency ?? 'IDR'

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS CashDrawer (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    shiftId      TEXT,
    openedAt     TEXT NOT NULL,
    closedAt     TEXT,
    openingFloat REAL NOT NULL DEFAULT 0,
    expectedCash REAL NOT NULL DEFAULT 0,
    actualCash   REAL NOT NULL DEFAULT 0,
    variance     REAL NOT NULL DEFAULT 0,
    closedBy     TEXT,
    status       TEXT NOT NULL DEFAULT 'OPEN'
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS CashMovement (
    id        TEXT PRIMARY KEY,
    drawerId  TEXT NOT NULL,
    storeId   TEXT NOT NULL,
    type      TEXT NOT NULL,
    amount    REAL NOT NULL DEFAULT 0,
    reference TEXT,
    note      TEXT,
    createdAt TEXT NOT NULL
  )`)

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Suspense fallback={<PageSkeleton />}>
        <CashDrawerClient storeId={storeId} currency={currency} />
      </Suspense>
    </main>
  )
}
