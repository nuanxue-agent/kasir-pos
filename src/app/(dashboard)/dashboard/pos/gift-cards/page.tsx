import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import GiftCardClient from '@/components/pos/GiftCardClient'

export const metadata = { title: 'Gift Cards — POS' }

export default async function GiftCardsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const user = session.user as any
  const store = user.stores?.[0]
  const storeId: string = store?.id ?? ''
  const currency: string = store?.currency ?? 'IDR'

  if (!storeId) redirect('/dashboard')

  await exec(`CREATE TABLE IF NOT EXISTS GiftCard (
    id             TEXT PRIMARY KEY,
    storeId        TEXT NOT NULL,
    code           TEXT NOT NULL UNIQUE,
    balance        REAL NOT NULL DEFAULT 0,
    initialBalance REAL NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'ACTIVE',
    expiryDate     TEXT,
    issuedAt       TEXT NOT NULL,
    issuedTo       TEXT,
    createdAt      TEXT NOT NULL,
    updatedAt      TEXT NOT NULL
  )`)

  await exec(`CREATE TABLE IF NOT EXISTS GiftCardTransaction (
    id        TEXT PRIMARY KEY,
    cardId    TEXT NOT NULL,
    storeId   TEXT NOT NULL,
    type      TEXT NOT NULL DEFAULT 'ISSUE',
    amount    REAL NOT NULL DEFAULT 0,
    orderId   TEXT,
    note      TEXT,
    createdAt TEXT NOT NULL
  )`)

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <GiftCardClient storeId={storeId} currency={currency} />
    </main>
  )
}
