import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import ReturnClient from '@/components/pos/ReturnClient'

export const metadata = { title: 'Retur & Refund — POS' }

export default async function ReturnsPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS Return (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    orderId      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'PENDING'
                 CHECK(status IN ('PENDING','APPROVED','REJECTED','COMPLETED')),
    reason       TEXT NOT NULL,
    refundMethod TEXT NOT NULL DEFAULT 'CASH'
                 CHECK(refundMethod IN ('CASH','WALLET','STORE_CREDIT')),
    totalRefund  REAL NOT NULL DEFAULT 0,
    processedBy  TEXT,
    createdAt    TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ReturnItem (
    id          TEXT PRIMARY KEY,
    returnId    TEXT NOT NULL,
    productId   TEXT NOT NULL,
    productName TEXT NOT NULL DEFAULT '',
    qty         INTEGER NOT NULL DEFAULT 1,
    unitPrice   REAL NOT NULL DEFAULT 0,
    subtotal    REAL NOT NULL DEFAULT 0,
    condition   TEXT NOT NULL DEFAULT 'GOOD'
                CHECK(condition IN ('GOOD','DAMAGED','EXPIRED')),
    restockable INTEGER NOT NULL DEFAULT 1
  )`)

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <ReturnClient storeId={storeId} />
    </main>
  )
}
