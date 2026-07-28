import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import ApiKeyClient from '@/components/settings/ApiKeyClient'

export const metadata = { title: 'API Keys & Webhook — Pengaturan' }

export default async function ApiKeysPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS ApiKey (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    name        TEXT NOT NULL,
    keyHash     TEXT NOT NULL,
    keyPrefix   TEXT NOT NULL,
    scopes      TEXT NOT NULL DEFAULT '[]',
    lastUsedAt  TEXT,
    expiresAt   TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    createdBy   TEXT NOT NULL,
    createdAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS WebhookLog (
    id           TEXT PRIMARY KEY,
    webhookId    TEXT NOT NULL,
    storeId      TEXT NOT NULL,
    event        TEXT NOT NULL,
    payload      TEXT NOT NULL DEFAULT '{}',
    status       TEXT NOT NULL DEFAULT 'FAILED',
    responseCode INTEGER,
    createdAt    TEXT NOT NULL
  )`)

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <ApiKeyClient storeId={storeId} />
    </main>
  )
}
