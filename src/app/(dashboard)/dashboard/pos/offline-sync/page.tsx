import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import OfflineSyncClient from '@/components/pos/OfflineSyncClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Offline Sync — POS' }

export default async function OfflineSyncPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init on first page load
  await exec(`
    CREATE TABLE IF NOT EXISTS SyncQueue (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      action      TEXT NOT NULL,
      payload     TEXT NOT NULL DEFAULT '{}',
      status      TEXT NOT NULL DEFAULT 'PENDING',
      createdAt   TEXT NOT NULL,
      syncedAt    TEXT,
      retryCount  INTEGER NOT NULL DEFAULT 0
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS SyncConflict (
      id           TEXT PRIMARY KEY,
      syncQueueId  TEXT NOT NULL,
      storeId      TEXT NOT NULL,
      conflictType TEXT NOT NULL,
      localData    TEXT NOT NULL DEFAULT '{}',
      serverData   TEXT NOT NULL DEFAULT '{}',
      resolved     INTEGER NOT NULL DEFAULT 0,
      resolvedAt   TEXT
    )
  `)

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Suspense fallback={<PageSkeleton />}>
        <OfflineSyncClient storeId={storeId} />
      </Suspense>
    </main>
  )
}
