import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import MultiStoreClient from '@/components/settings/MultiStoreClient'

export const metadata = { title: 'Branch Management — Settings' }

export default async function BranchesPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS Branch (
    id            TEXT PRIMARY KEY,
    parentStoreId TEXT NOT NULL,
    name          TEXT NOT NULL,
    address       TEXT NOT NULL DEFAULT '',
    phone         TEXT NOT NULL DEFAULT '',
    managerId     TEXT,
    timezone      TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    currency      TEXT NOT NULL DEFAULT 'IDR',
    active        INTEGER NOT NULL DEFAULT 1,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <MultiStoreClient storeId={storeId} currency={currency} />
    </main>
  )
}
