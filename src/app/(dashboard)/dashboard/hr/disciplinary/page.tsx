import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import DisciplinaryClient from '@/components/hr/DisciplinaryClient'

export const metadata = { title: 'Disiplin & Insiden — HR' }

export default async function DisciplinaryPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS DisciplinaryAction (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    employeeId    TEXT NOT NULL,
    type          TEXT NOT NULL DEFAULT 'VERBAL_WARNING',
    reason        TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    date          TEXT NOT NULL,
    issuedBy      TEXT NOT NULL,
    acknowledged  INTEGER NOT NULL DEFAULT 0,
    acknowledgedAt TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS Incident (
    id                TEXT PRIMARY KEY,
    storeId           TEXT NOT NULL,
    reportedBy        TEXT NOT NULL,
    involvedEmployees TEXT NOT NULL DEFAULT '[]',
    type              TEXT NOT NULL DEFAULT 'OTHER',
    description       TEXT NOT NULL DEFAULT '',
    severity          TEXT NOT NULL DEFAULT 'LOW',
    status            TEXT NOT NULL DEFAULT 'OPEN',
    createdAt         TEXT NOT NULL,
    updatedAt         TEXT NOT NULL
  )`)

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <DisciplinaryClient storeId={storeId} />
    </main>
  )
}
