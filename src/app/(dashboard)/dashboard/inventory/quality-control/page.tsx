import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import QualityControlClient from '@/components/inventory/QualityControlClient'

export const metadata = { title: 'Kontrol Kualitas — Inventaris' }

export default async function QualityControlPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS QCInspection (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    productId     TEXT NOT NULL,
    referenceId   TEXT,
    referenceType TEXT NOT NULL DEFAULT 'PURCHASE_ORDER',
    inspectedBy   TEXT NOT NULL,
    inspectedAt   TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    passQty       REAL NOT NULL DEFAULT 0,
    failQty       REAL NOT NULL DEFAULT 0,
    notes         TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`).catch(() => null)
  await exec(`CREATE TABLE IF NOT EXISTS QCCheckpoint (
    id           TEXT PRIMARY KEY,
    inspectionId TEXT NOT NULL,
    storeId      TEXT NOT NULL,
    criterion    TEXT NOT NULL,
    result       TEXT NOT NULL DEFAULT 'NA',
    value        TEXT,
    threshold    TEXT,
    notes        TEXT,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`).catch(() => null)

  return <QualityControlClient storeId={storeId} />
}
