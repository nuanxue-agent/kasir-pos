import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import PriceListClient from '@/components/products/PriceListClient'

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS PriceList (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    type          TEXT NOT NULL DEFAULT 'RETAIL',
    discountType  TEXT NOT NULL DEFAULT 'PERCENTAGE',
    discountValue REAL NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1,
    validFrom     TEXT,
    validTo       TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS PriceListItem (
    id          TEXT PRIMARY KEY,
    priceListId TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    price       REAL NOT NULL DEFAULT 0,
    minQty      REAL NOT NULL DEFAULT 1,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS CustomerPriceList (
    id          TEXT PRIMARY KEY,
    customerId  TEXT NOT NULL,
    storeId     TEXT NOT NULL,
    priceListId TEXT NOT NULL,
    assignedAt  TEXT NOT NULL
  )`)
}

export default async function PriceListsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'

  await ensureTables()

  const [plRows, products, customers] = await Promise.all([
    query(
      `SELECT * FROM PriceList WHERE storeId = ? ORDER BY createdAt DESC`,
      [storeId],
    ),
    query(
      `SELECT id, name, price, sku FROM Product WHERE storeId = ? AND active = 1 ORDER BY name`,
      [storeId],
    ),
    query(
      `SELECT id, name, phone FROM Customer WHERE storeId = ? ORDER BY name`,
      [storeId],
    ),
  ])

  const priceLists = (plRows as any[]).map(r => ({ ...r, active: Boolean(r.active) }))

  return (
    <PriceListClient
      storeId={storeId}
      currency={currency}
      initialPriceLists={priceLists as any}
      products={products as any}
      customers={customers as any}
    />
  )
}
