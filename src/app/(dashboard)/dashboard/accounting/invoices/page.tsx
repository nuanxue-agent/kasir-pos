import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import InvoiceClient from '@/components/accounting/InvoiceClient'

export const metadata = { title: 'Invoices — Accounting' }

export default async function InvoicesPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS Invoice (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    number       TEXT NOT NULL,
    customerName TEXT NOT NULL,
    issueDate    TEXT NOT NULL,
    dueDate      TEXT NOT NULL,
    terms        TEXT NOT NULL DEFAULT 'NET30',
    status       TEXT NOT NULL DEFAULT 'DRAFT',
    subtotal     REAL NOT NULL DEFAULT 0,
    taxAmount    REAL NOT NULL DEFAULT 0,
    total        REAL NOT NULL DEFAULT 0,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS InvoiceItem (
    id          TEXT PRIMARY KEY,
    invoiceId   TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    description TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 1,
    unitPrice   REAL NOT NULL DEFAULT 0,
    taxRate     REAL NOT NULL DEFAULT 0,
    createdAt   TEXT NOT NULL
  )`)

  const currency: string = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <InvoiceClient storeId={storeId} currency={currency} />
    </main>
  )
}
