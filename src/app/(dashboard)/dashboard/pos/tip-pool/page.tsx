import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import TipPoolClient from '@/components/pos/TipPoolClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Tip Pool — POS' }

export default async function TipPoolPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const store = user.stores?.[0]
  const storeId: string = store?.id ?? ''
  const currency: string = store?.currency ?? 'IDR'

  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS TipPool (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    date      TEXT NOT NULL,
    totalTips REAL NOT NULL DEFAULT 0,
    status    TEXT NOT NULL DEFAULT 'OPEN',
    closedAt  TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS TipDistribution (
    id            TEXT PRIMARY KEY,
    poolId        TEXT NOT NULL,
    employeeId    TEXT NOT NULL,
    storeId       TEXT NOT NULL,
    amount        REAL NOT NULL DEFAULT 0,
    role          TEXT NOT NULL DEFAULT 'STAFF',
    hoursWorked   REAL NOT NULL DEFAULT 0,
    distributedAt TEXT NOT NULL
  )`)

  return (
    <Suspense fallback={<PageSkeleton />}>
      <TipPoolClient storeId={storeId} currency={currency} />
    </Suspense>
  )
}
