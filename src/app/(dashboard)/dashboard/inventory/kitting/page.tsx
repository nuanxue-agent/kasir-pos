import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import KittingClient from '@/components/inventory/KittingClient'

export const metadata = { title: 'Kitting & Assembly — Inventory' }

export default async function KittingPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS Kit (
    id              TEXT PRIMARY KEY,
    storeId         TEXT NOT NULL,
    name            TEXT NOT NULL,
    outputProductId TEXT NOT NULL,
    outputQty       REAL NOT NULL DEFAULT 1,
    instructions    TEXT,
    active          INTEGER NOT NULL DEFAULT 1,
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS KitComponent (
    id                 TEXT PRIMARY KEY,
    kitId              TEXT NOT NULL,
    storeId            TEXT NOT NULL,
    componentProductId TEXT NOT NULL,
    requiredQty        REAL NOT NULL DEFAULT 1
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS AssemblyJob (
    id          TEXT PRIMARY KEY,
    kitId       TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    targetQty   REAL NOT NULL DEFAULT 1,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    startedAt   TEXT,
    completedAt TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)

  const [kitsRaw, productsRaw] = await Promise.all([
    query(
      `SELECT k.*, p.name AS outputProductName
       FROM Kit k
       LEFT JOIN Product p ON p.id = k.outputProductId
       WHERE k.storeId = ?
       ORDER BY k.createdAt DESC`,
      [storeId],
    ),
    query(
      `SELECT id, name, price, cost, stock FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId],
    ),
  ])

  const currency: string = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <KittingClient
        storeId={storeId}
        currency={currency}
        initialKits={kitsRaw as any[]}
        products={productsRaw as any[]}
      />
    </main>
  )
}
