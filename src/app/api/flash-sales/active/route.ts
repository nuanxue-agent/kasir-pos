import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS FlashSale (
    id        TEXT PRIMARY KEY,
    storeId   TEXT NOT NULL,
    name      TEXT NOT NULL,
    startAt   TEXT NOT NULL,
    endAt     TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'SCHEDULED',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS FlashSaleItem (
    id            TEXT PRIMARY KEY,
    saleId        TEXT NOT NULL,
    storeId       TEXT NOT NULL,
    productId     TEXT NOT NULL,
    originalPrice REAL NOT NULL DEFAULT 0,
    salePrice     REAL NOT NULL DEFAULT 0,
    discountPct   REAL NOT NULL DEFAULT 0,
    stockLimit    INTEGER NOT NULL DEFAULT 0,
    soldQty       INTEGER NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
}

// GET /api/flash-sales/active?storeId=xxx
// Returns sales that are ACTIVE or SCHEDULED (with their items)
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const user = session.user as any
    const urlStoreId = new URL(req.url).searchParams.get('storeId')
    const storeId: string =
      (urlStoreId && user.stores?.some((s: any) => s.id === urlStoreId) ? urlStoreId : null) ??
      user.stores?.[0]?.id ?? ''
    if (!storeId) return err('Forbidden', 403)

    await ensureTables()

    const now = new Date().toISOString()

    // Return sales currently within their time window (status != CANCELLED/ENDED)
    const sales = await query(
      `SELECT * FROM FlashSale
       WHERE storeId = ?
         AND status NOT IN ('CANCELLED', 'ENDED')
         AND startAt <= ?
         AND endAt   >= ?
       ORDER BY endAt ASC`,
      [storeId, now, now],
    )

    // Enrich each sale with its active items
    const result = await Promise.all(
      (sales as any[]).map(async (sale) => {
        const items = await query(
          `SELECT * FROM FlashSaleItem WHERE saleId = ? AND active = 1 ORDER BY createdAt ASC`,
          [sale.id],
        )
        return { ...sale, items }
      }),
    )

    return ok(result)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
