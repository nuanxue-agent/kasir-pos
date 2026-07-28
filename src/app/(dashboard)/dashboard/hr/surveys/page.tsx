import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import SurveyClient from '@/components/hr/SurveyClient'

export const metadata = { title: 'Employee Surveys — HR' }

export default async function SurveysPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy-init survey tables
  await exec(`CREATE TABLE IF NOT EXISTS Survey (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type        TEXT NOT NULL DEFAULT 'SATISFACTION',
    questions   TEXT NOT NULL DEFAULT '[]',
    startDate   TEXT NOT NULL,
    endDate     TEXT NOT NULL,
    anonymous   INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'DRAFT',
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS SurveyResponse (
    id          TEXT PRIMARY KEY,
    surveyId    TEXT NOT NULL,
    employeeId  TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    answers     TEXT NOT NULL DEFAULT '[]',
    submittedAt TEXT NOT NULL
  )`)

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <SurveyClient storeId={storeId} />
    </main>
  )
}
