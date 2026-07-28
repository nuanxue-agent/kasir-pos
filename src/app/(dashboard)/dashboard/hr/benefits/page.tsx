import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import BenefitsClient from '@/components/hr/BenefitsClient'

export const metadata = { title: 'Tunjangan & Kesejahteraan — HR' }

export default async function BenefitsPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await exec(`CREATE TABLE IF NOT EXISTS BenefitPlan (
    id                   TEXT PRIMARY KEY,
    storeId              TEXT NOT NULL,
    name                 TEXT NOT NULL,
    type                 TEXT NOT NULL DEFAULT 'OTHER',
    employeeContribution REAL NOT NULL DEFAULT 0,
    employerContribution REAL NOT NULL DEFAULT 0,
    calculationBase      TEXT NOT NULL DEFAULT 'FIXED',
    active               INTEGER NOT NULL DEFAULT 1,
    createdAt            TEXT NOT NULL,
    updatedAt            TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS EmployeeBenefit (
    id          TEXT PRIMARY KEY,
    employeeId  TEXT NOT NULL,
    planId      TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1,
    enrolledAt  TEXT NOT NULL,
    value       REAL NOT NULL DEFAULT 0,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <BenefitsClient storeId={storeId} />
    </main>
  )
}
