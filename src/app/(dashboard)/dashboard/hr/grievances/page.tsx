import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import GrievanceClient from '@/components/hr/GrievanceClient'

export const metadata = { title: 'Keluhan & Disiplin — HR' }

export default async function GrievancesPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS Grievance (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    employeeId  TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'GRIEVANCE',
    subject     TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'OPEN',
    severity    TEXT NOT NULL DEFAULT 'LOW',
    reportedBy  TEXT NOT NULL,
    resolvedBy  TEXT,
    resolution  TEXT,
    resolvedAt  TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS GrievanceNote (
    id          TEXT PRIMARY KEY,
    grievanceId TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    authorId    TEXT NOT NULL,
    note        TEXT NOT NULL,
    createdAt   TEXT NOT NULL
  )`)

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <GrievanceClient storeId={storeId} />
    </main>
  )
}
