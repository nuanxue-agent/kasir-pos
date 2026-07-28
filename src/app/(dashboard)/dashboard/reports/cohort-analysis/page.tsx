import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import CohortAnalysisClient from '@/components/reports/CohortAnalysisClient'

export const metadata = { title: 'Cohort Analysis — Reports' }

export default async function CohortAnalysisPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`
    CREATE TABLE IF NOT EXISTS CohortData (
      id            TEXT PRIMARY KEY,
      storeId       TEXT NOT NULL,
      cohortMonth   TEXT NOT NULL,
      periodOffset  INTEGER NOT NULL DEFAULT 0,
      customers     INTEGER NOT NULL DEFAULT 0,
      retained      INTEGER NOT NULL DEFAULT 0,
      retentionRate REAL NOT NULL DEFAULT 0,
      revenue       REAL NOT NULL DEFAULT 0,
      computedAt    TEXT NOT NULL
    )
  `)

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <CohortAnalysisClient storeId={storeId} currency={currency} />
    </main>
  )
}
