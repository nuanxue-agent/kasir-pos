import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import PerformanceScoreClient from '@/components/hr/PerformanceScoreClient'

export const metadata = { title: 'Skor Performa Karyawan — HR' }

export default async function PerformanceScorePage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS PerformanceScore (
    id              TEXT PRIMARY KEY,
    storeId         TEXT NOT NULL,
    employeeId      TEXT NOT NULL,
    period          TEXT NOT NULL,
    salesScore      REAL NOT NULL DEFAULT 0,
    attendanceScore REAL NOT NULL DEFAULT 0,
    customerScore   REAL NOT NULL DEFAULT 0,
    overallScore    REAL NOT NULL DEFAULT 0,
    rank            INTEGER NOT NULL DEFAULT 0,
    badge           TEXT NOT NULL DEFAULT 'BRONZE',
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL
  )`)

  const employees = await query(
    `SELECT id, name, role FROM Employee WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
    [storeId],
  ).catch(() => [])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PerformanceScoreClient
        storeId={storeId}
        employees={employees as any[]}
      />
    </main>
  )
}
