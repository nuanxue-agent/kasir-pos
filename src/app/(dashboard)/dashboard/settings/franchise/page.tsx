import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec, query } from '@/lib/db'
import FranchiseClient from '@/components/settings/FranchiseClient'

export const metadata = { title: 'Franchise Management — Settings' }

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Franchise (
    id                TEXT PRIMARY KEY,
    franchiseeStoreId TEXT NOT NULL,
    franchisorStoreId TEXT NOT NULL,
    royaltyRate       REAL NOT NULL DEFAULT 0,
    royaltyType       TEXT NOT NULL DEFAULT 'PERCENTAGE',
    billingCycle      TEXT NOT NULL DEFAULT 'MONTHLY',
    status            TEXT NOT NULL DEFAULT 'ACTIVE',
    startDate         TEXT NOT NULL,
    createdAt         TEXT NOT NULL,
    updatedAt         TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS FranchiseRoyalty (
    id          TEXT PRIMARY KEY,
    franchiseId TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    period      TEXT NOT NULL,
    amount      REAL NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    dueDate     TEXT NOT NULL,
    paidAt      TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

export default async function FranchisePage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await ensureTables()

  const [franchises, royalties] = await Promise.all([
    query(
      `SELECT * FROM Franchise WHERE franchisorStoreId = ? OR franchiseeStoreId = ? ORDER BY createdAt DESC`,
      [storeId, storeId],
    ),
    query(
      `SELECT r.* FROM FranchiseRoyalty r
       JOIN Franchise f ON r.franchiseId = f.id
       WHERE f.franchisorStoreId = ? OR f.franchiseeStoreId = ?
       ORDER BY r.period DESC`,
      [storeId, storeId],
    ),
  ])

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <FranchiseClient
        storeId={storeId}
        currency={currency}
        initialFranchises={franchises as any[]}
        initialRoyalties={royalties as any[]}
      />
    </main>
  )
}
