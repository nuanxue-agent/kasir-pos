import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import NotificationCenterClient from '@/components/settings/NotificationCenterClient'

export const metadata = { title: 'Pusat Notifikasi — Pengaturan' }

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS NotificationRule (
      id        TEXT PRIMARY KEY,
      storeId   TEXT NOT NULL,
      event     TEXT NOT NULL,
      channel   TEXT NOT NULL DEFAULT 'IN_APP',
      threshold REAL NOT NULL DEFAULT 0,
      active    INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS NotificationLog (
      id        TEXT PRIMARY KEY,
      storeId   TEXT NOT NULL,
      ruleId    TEXT,
      event     TEXT NOT NULL,
      message   TEXT NOT NULL,
      channel   TEXT NOT NULL DEFAULT 'IN_APP',
      status    TEXT NOT NULL DEFAULT 'PENDING',
      read      INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    )
  `)
}

export default async function NotificationsSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await ensureTables()

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <NotificationCenterClient storeId={storeId} />
    </main>
  )
}
