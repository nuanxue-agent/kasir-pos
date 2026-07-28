import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import FlashSaleClient from '@/components/products/FlashSaleClient'

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS FlashSale (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    name      TEXT NOT NULL,
    startAt   TEXT NOT NULL,
    endAt     TEXT NOT NULL,
    active    INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS FlashSaleItem (
    id            TEXT PRIMARY KEY,
    saleId        TEXT NOT NULL,
    productId     TEXT NOT NULL,
    discountType  TEXT NOT NULL DEFAULT 'PERCENTAGE',
    discountValue REAL NOT NULL DEFAULT 0,
    maxQty        INTEGER NOT NULL DEFAULT 0,
    soldQty       INTEGER NOT NULL DEFAULT 0,
    createdAt     TEXT NOT NULL
  )`)
}

export default async function FlashSalesPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as any
  const storeId = user.stores?.[0]?.id ?? ''
  const currency = user.stores?.[0]?.currency ?? 'IDR'

  await ensureTables()

  const [saleRows, products] = await Promise.all([
    query(
      `SELECT fs.*,
              GROUP_CONCAT(fsi.id||':'||fsi.productId||':'||fsi.discountType||':'||fsi.discountValue||':'||fsi.maxQty||':'||fsi.soldQty) AS itemsRaw
       FROM FlashSale fs
       LEFT JOIN FlashSaleItem fsi ON fsi.saleId = fs.id
       WHERE fs.storeId = ?
       GROUP BY fs.id
       ORDER BY fs.startAt DESC`,
      [storeId],
    ),
    query(
      `SELECT id, name, price FROM Product WHERE storeId = ? AND active = 1 ORDER BY name`,
      [storeId],
    ),
  ])

  const productMap = Object.fromEntries((products as any[]).map(p => [p.id, p]))

  const sales = (saleRows as any[]).map(row => {
    const items = row.itemsRaw
      ? row.itemsRaw.split(',').map((s: string) => {
          const [id, productId, discountType, discountValue, maxQty, soldQty] = s.split(':')
          return {
            id,
            productId,
            discountType,
            discountValue: Number(discountValue),
            maxQty: Number(maxQty),
            soldQty: Number(soldQty),
            product: productMap[productId] ?? null,
          }
        })
      : []
    const { itemsRaw, ...rest } = row
    return { ...rest, active: Boolean(rest.active), items }
  })

  return (
    <FlashSaleClient
      storeId={storeId}
      currency={currency}
      initialSales={sales as any}
      products={products as any}
    />
  )
}
