import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import VendorEvaluationClient from '@/components/inventory/VendorEvaluationClient'

export const metadata = { title: 'Evaluasi Vendor — Inventori' }

export default async function VendorEvaluationPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS VendorEvaluation (
    id                 TEXT PRIMARY KEY,
    storeId            TEXT NOT NULL,
    vendorId           TEXT NOT NULL,
    orderId            TEXT,
    deliveryScore      REAL NOT NULL,
    qualityScore       REAL NOT NULL,
    priceScore         REAL NOT NULL,
    communicationScore REAL NOT NULL,
    overallScore       REAL NOT NULL,
    notes              TEXT,
    evaluatedAt        TEXT NOT NULL
  )`)

  // Load vendors (table may not exist yet on fresh installs)
  const vendors = await query(
    `SELECT id, name FROM Vendor WHERE storeId = ? ORDER BY name ASC`,
    [storeId]
  ).catch(() => [])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <VendorEvaluationClient storeId={storeId} vendors={vendors as any[]} />
    </main>
  )
}
