import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import DemandForecastClient from '@/components/inventory/DemandForecastClient'

export const metadata = { title: 'Demand Forecasting — Inventory' }

export default async function DemandForecastPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy init tables
  await exec(`CREATE TABLE IF NOT EXISTS ForecastModel (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    productId     TEXT NOT NULL,
    method        TEXT NOT NULL DEFAULT 'MOVING_AVG',
    windowDays    INTEGER NOT NULL DEFAULT 7,
    alpha         REAL NOT NULL DEFAULT 0.3,
    lastTrainedAt TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ForecastResult (
    id             TEXT PRIMARY KEY,
    modelId        TEXT NOT NULL,
    storeId        TEXT NOT NULL,
    productId      TEXT NOT NULL,
    forecastDate   TEXT NOT NULL,
    predictedQty   REAL NOT NULL DEFAULT 0,
    confidenceLow  REAL NOT NULL DEFAULT 0,
    confidenceHigh REAL NOT NULL DEFAULT 0,
    actualQty      REAL,
    createdAt      TEXT NOT NULL
  )`)

  const products = await query(
    `SELECT id, name FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
    [storeId]
  )

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <DemandForecastClient
        storeId={storeId}
        products={products as any[]}
      />
    </main>
  )
}
