// GET /api/flash-sales?storeId=
// POST /api/flash-sales
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

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

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const rows = await query(
    `SELECT fs.*,
            GROUP_CONCAT(fsi.id||':'||fsi.productId||':'||fsi.discountType||':'||fsi.discountValue||':'||fsi.maxQty||':'||fsi.soldQty) AS itemsRaw
     FROM FlashSale fs
     LEFT JOIN FlashSaleItem fsi ON fsi.saleId = fs.id
     WHERE fs.storeId = ?
     GROUP BY fs.id
     ORDER BY fs.startAt DESC`,
    [storeId],
  )

  const sales = (rows as any[]).map(row => {
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
          }
        })
      : []
    const { itemsRaw, ...rest } = row
    return { ...rest, active: Boolean(rest.active), items }
  })

  return NextResponse.json(sales)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as any
  if (!b.name) return err("Field 'name' is required", 400, 'MISSING_FIELD')
  if (!b.startAt) return err("Field 'startAt' is required", 400, 'MISSING_FIELD')
  if (!b.endAt) return err("Field 'endAt' is required", 400, 'MISSING_FIELD')
  if (new Date(b.endAt) <= new Date(b.startAt))
    return err("'endAt' must be after 'startAt'", 400, 'VALIDATION_ERROR')

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO FlashSale (id, storeId, name, startAt, endAt, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, b.name, b.startAt, b.endAt, b.active !== false ? 1 : 0, t, t],
  )
  return NextResponse.json({ id }, { status: 201 })
}
