import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import ReviewModerationClient from '@/components/crm/ReviewModerationClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Review Moderation — CRM' }

export default async function ReviewModerationPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS ReviewModeration (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    reviewId    TEXT NOT NULL,
    moderatorId TEXT NOT NULL,
    action      TEXT NOT NULL,
    reason      TEXT,
    moderatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS AutoModRule (
    id        TEXT    PRIMARY KEY,
    storeId   TEXT    NOT NULL,
    keyword   TEXT    NOT NULL,
    action    TEXT    NOT NULL DEFAULT 'FLAG',
    active    INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT    NOT NULL,
    updatedAt TEXT    NOT NULL
  )`)

  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReviewModerationClient
        storeId={store.id}
        currency={store.currency ?? 'IDR'}
      />
    </Suspense>
  )
}
