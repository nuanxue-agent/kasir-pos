// GET /api/flash-sales/active?storeId= — returns currently active sales for POS
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

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

  const now = new Date().toISOString()

  // Active: active=1, startAt <= now <= endAt, stock not exhausted (maxQty=0 means unlimited)
  const rows = await query(
    `SELECT fs.id AS saleId, fs.name AS saleName,
            fsi.id AS itemId, fsi.productId, fsi.discountType,
            fsi.discountValue, fsi.maxQty, fsi.soldQty,
            p.name AS productName, p.price AS originalPrice
     FROM FlashSale fs
     JOIN FlashSaleItem fsi ON fsi.saleId = fs.id
     JOIN Product p ON p.id = fsi.productId
     WHERE fs.storeId = ?
       AND fs.active = 1
       AND fs.startAt <= ?
       AND fs.endAt > ?
       AND (fsi.maxQty = 0 OR fsi.soldQty < fsi.maxQty)`,
    [storeId, now, now],
  )

  // Group by product so POS can quickly look up flash price by productId
  const byProduct: Record<string, any> = {}
  for (const row of rows as any[]) {
    byProduct[row.productId] = {
      saleId: row.saleId,
      saleName: row.saleName,
      itemId: row.itemId,
      productId: row.productId,
      productName: row.productName,
      originalPrice: row.originalPrice,
      discountType: row.discountType,
      discountValue: row.discountValue,
      maxQty: row.maxQty,
      soldQty: row.soldQty,
    }
  }

  return NextResponse.json(Object.values(byProduct))
}
