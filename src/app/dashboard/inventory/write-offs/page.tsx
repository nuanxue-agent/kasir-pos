import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import WriteOffClient from '@/components/inventory/WriteOffClient'

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS InventoryWriteOff (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    productName TEXT NOT NULL,
    qty         REAL NOT NULL DEFAULT 0,
    reason      TEXT NOT NULL DEFAULT 'OTHER',
    costValue   REAL NOT NULL DEFAULT 0,
    approvedBy  TEXT,
    approvedAt  TEXT,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    notes       TEXT,
    createdAt   TEXT NOT NULL,
    createdBy   TEXT NOT NULL
  )`)
}

export default async function WriteOffsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  const storeId = user.stores?.[0]?.id
  if (!storeId) redirect('/dashboard')

  await ensureTable()

  const [writeOffs, products] = await Promise.all([
    query(
      `SELECT * FROM InventoryWriteOff WHERE storeId = ? ORDER BY createdAt DESC LIMIT 200`,
      [storeId]
    ),
    query(
      `SELECT id, name, cost FROM Product WHERE storeId = ? ORDER BY name ASC`,
      [storeId]
    ),
  ])

  const currency = user.stores?.[0]?.currency ?? 'IDR'
  const role = (user.role ?? '') as string
  const isManager = role === 'OWNER' || role === 'MANAGER' || role === 'ADMIN'
  const currentUser = (user.name ?? user.email ?? 'Unknown') as string

  return (
    <WriteOffClient
      storeId={storeId}
      currency={currency}
      initialWriteOffs={writeOffs as any}
      products={products as any}
      isManager={isManager}
      currentUser={currentUser}
    />
  )
}
