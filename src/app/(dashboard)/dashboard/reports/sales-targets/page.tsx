import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import SalesTargetClient from '@/components/reports/SalesTargetClient'

export const metadata = {
  title: 'Target Penjualan',
  description: 'Kelola target dan kuota penjualan per karyawan, toko, dan kategori produk',
}

export default async function SalesTargetsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  const currency: string = user.stores?.[0]?.currency ?? 'IDR'
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`
    CREATE TABLE IF NOT EXISTS SalesTarget (
      id           TEXT PRIMARY KEY,
      storeId      TEXT NOT NULL,
      targetType   TEXT NOT NULL,
      targetId     TEXT NOT NULL,
      period       TEXT NOT NULL,
      targetAmount REAL NOT NULL DEFAULT 0,
      startDate    TEXT NOT NULL,
      endDate      TEXT NOT NULL,
      createdAt    TEXT NOT NULL,
      updatedAt    TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS SalesAchievement (
      id             TEXT PRIMARY KEY,
      targetId       TEXT NOT NULL,
      storeId        TEXT NOT NULL,
      actualAmount   REAL NOT NULL DEFAULT 0,
      achievementPct REAL NOT NULL DEFAULT 0,
      period         TEXT NOT NULL,
      computedAt     TEXT NOT NULL
    )
  `)

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Suspense fallback={<PageSkeleton />}>
        <SalesTargetClient storeId={storeId} currency={currency} />
      </Suspense>
    </main>
  )
}
