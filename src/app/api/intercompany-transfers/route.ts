// GET /api/intercompany-transfers?storeId=
// POST /api/intercompany-transfers
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS InterCompanyTransfer (
      id          TEXT PRIMARY KEY,
      fromStoreId TEXT NOT NULL,
      toStoreId   TEXT NOT NULL,
      type        TEXT NOT NULL CHECK(type IN ('STOCK','CASH')),
      amount      REAL NOT NULL DEFAULT 0,
      productId   TEXT,
      qty         REAL,
      status      TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED')),
      createdAt   TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTable()

  const sid = sp.get('storeId') ?? storeId
  const transfers = (await query(
    `SELECT t.*,
            fs.name as fromStoreName,
            ts.name as toStoreName,
            p.name  as productName
       FROM InterCompanyTransfer t
       LEFT JOIN Store fs ON t.fromStoreId = fs.id
       LEFT JOIN Store ts ON t.toStoreId   = ts.id
       LEFT JOIN Product p ON t.productId  = p.id
      WHERE t.fromStoreId = ? OR t.toStoreId = ?
      ORDER BY t.createdAt DESC
      LIMIT 200`,
    [sid, sid],
  )) as any[]
  return NextResponse.json({ transfers })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTable()

  const b = (await req.json()) as Record<string, any>

  // Validate required fields
  for (const f of ['fromStoreId', 'toStoreId', 'type', 'amount']) {
    if (b[f] === undefined || b[f] === null || b[f] === '')
      return err(`Field '${f}' is required`, 400, 'MISSING_FIELD')
  }
  if (!['STOCK', 'CASH'].includes(b.type))
    return err("type must be 'STOCK' or 'CASH'", 400, 'INVALID_VALUE')

  const amount = Number(b.amount)
  if (isNaN(amount) || amount <= 0)
    return err("'amount' must be a positive number", 400, 'INVALID_VALUE')

  if (b.fromStoreId === b.toStoreId)
    return err('fromStoreId and toStoreId must differ', 400, 'INVALID_VALUE')

  if (b.type === 'STOCK') {
    for (const f of ['productId', 'qty']) {
      if (b[f] === undefined || b[f] === null || b[f] === '')
        return err(`Field '${f}' is required`, 400, 'MISSING_FIELD')
    }
    const qty = Number(b.qty)
    if (isNaN(qty) || qty <= 0) return err("'qty' must be a positive number", 400, 'INVALID_VALUE')
  }

  const id = newId()
  await exec(
    `INSERT INTO InterCompanyTransfer (id, fromStoreId, toStoreId, type, amount, productId, qty, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    [id, b.fromStoreId, b.toStoreId, b.type, amount, b.productId ?? null, b.qty ?? null, nowISO()],
  )
  const created = await queryOne(`SELECT * FROM InterCompanyTransfer WHERE id = ?`, [id])
  return NextResponse.json({ transfer: created }, { status: 201 })
}
