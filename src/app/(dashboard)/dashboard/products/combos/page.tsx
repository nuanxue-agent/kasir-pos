import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import ComboBuilderClient from '@/components/products/ComboBuilderClient'

export const metadata = { title: 'Combo Builder — Products' }

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Combo (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    basePrice     REAL NOT NULL DEFAULT 0,
    discountType  TEXT NOT NULL DEFAULT 'PERCENTAGE',
    discountValue REAL NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1,
    startDate     TEXT,
    endDate       TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ComboItem (
    id                TEXT PRIMARY KEY,
    comboId           TEXT NOT NULL,
    storeId           TEXT NOT NULL,
    productId         TEXT NOT NULL,
    qty               INTEGER NOT NULL DEFAULT 1,
    isOptional        INTEGER NOT NULL DEFAULT 0,
    substituteGroupId TEXT,
    createdAt         TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ComboSubstituteGroup (
    id        TEXT PRIMARY KEY,
    comboId   TEXT NOT NULL,
    storeId   TEXT NOT NULL,
    name      TEXT NOT NULL,
    minPick   INTEGER NOT NULL DEFAULT 1,
    maxPick   INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL
  )`)
}

export default async function CombosPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await ensureTables()

  const [comboRows, products] = await Promise.all([
    query(
      `SELECT c.*,
              GROUP_CONCAT(
                ci.id||'~'||ci.productId||'~'||ci.qty||'~'||ci.isOptional||'~'||COALESCE(ci.substituteGroupId,'')
              ) AS itemsRaw
       FROM Combo c
       LEFT JOIN ComboItem ci ON ci.comboId = c.id
       WHERE c.storeId = ?
       GROUP BY c.id
       ORDER BY c.name ASC`,
      [storeId],
    ),
    query(
      `SELECT id, name, price, cost FROM Product WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
      [storeId],
    ),
  ])

  const combos = (comboRows as any[]).map(row => {
    const items = row.itemsRaw
      ? row.itemsRaw.split(',').map((s: string) => {
          const [id, productId, qty, isOptional, substituteGroupId] = s.split('~')
          return {
            id,
            productId,
            qty: Number(qty),
            isOptional: isOptional === '1',
            substituteGroupId: substituteGroupId || null,
          }
        })
      : []
    const { itemsRaw, ...rest } = row
    return { ...rest, active: Boolean(rest.active), items }
  })

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <ComboBuilderClient
        storeId={storeId}
        currency={currency}
        initialCombos={combos as any}
        products={products as any[]}
      />
    </main>
  )
}
