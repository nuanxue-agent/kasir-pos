// GET /api/returns?storeId=
// POST /api/returns
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Return (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    orderId      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK(status IN ('PENDING','APPROVED','REJECTED','COMPLETED')),
    reason       TEXT NOT NULL,
    refundMethod TEXT NOT NULL DEFAULT 'CASH'
                   CHECK(refundMethod IN ('CASH','WALLET','STORE_CREDIT')),
    totalRefund  REAL NOT NULL DEFAULT 0,
    processedBy  TEXT,
    createdAt    TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ReturnItem (
    id        TEXT PRIMARY KEY,
    returnId  TEXT NOT NULL,
    productId TEXT NOT NULL,
    productName TEXT NOT NULL DEFAULT '',
    qty       INTEGER NOT NULL DEFAULT 1,
    unitPrice REAL NOT NULL DEFAULT 0,
    subtotal  REAL NOT NULL DEFAULT 0
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
    `SELECT r.*,
            GROUP_CONCAT(
              ri.id||'|'||ri.productId||'|'||ri.productName||'|'||ri.qty||'|'||ri.unitPrice||'|'||ri.subtotal,
              ';;'
            ) AS itemsRaw
     FROM Return r
     LEFT JOIN ReturnItem ri ON ri.returnId = r.id
     WHERE r.storeId = ?
     GROUP BY r.id
     ORDER BY r.createdAt DESC`,
    [storeId],
  )

  const returns = (rows as any[]).map(row => {
    const items = row.itemsRaw
      ? row.itemsRaw.split(';;').map((s: string) => {
          const [id, productId, productName, qty, unitPrice, subtotal] = s.split('|')
          return {
            id,
            returnId: row.id,
            productId,
            productName,
            qty: Number(qty),
            unitPrice: Number(unitPrice),
            subtotal: Number(subtotal),
          }
        })
      : []
    const { itemsRaw, ...rest } = row
    return { ...rest, items }
  })

  return NextResponse.json(returns)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  await ensureTables()

  const b = (await req.json()) as any
  const storeId = b.storeId ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')
  if (!b.orderId) return err('orderId required', 400, 'MISSING_FIELD')
  if (!b.reason?.trim()) return err('reason required', 400, 'MISSING_FIELD')
  if (!['CASH', 'WALLET', 'STORE_CREDIT'].includes(b.refundMethod))
    return err('refundMethod must be CASH, WALLET, or STORE_CREDIT', 400, 'VALIDATION_ERROR')
  if (!Array.isArray(b.items) || b.items.length === 0)
    return err('items must be a non-empty array', 400, 'MISSING_FIELD')

  const totalRefund: number = b.items.reduce(
    (sum: number, i: any) => sum + (Number(i.qty) * Number(i.unitPrice)),
    0,
  )

  const id = newId()
  const createdAt = nowISO()

  await exec(
    `INSERT INTO Return (id, storeId, orderId, status, reason, refundMethod, totalRefund, processedBy, createdAt)
     VALUES (?, ?, ?, 'PENDING', ?, ?, ?, NULL, ?)`,
    [id, storeId, b.orderId, b.reason.trim(), b.refundMethod, totalRefund, createdAt],
  )

  for (const item of b.items) {
    const subtotal = Number(item.qty) * Number(item.unitPrice)
    await exec(
      `INSERT INTO ReturnItem (id, returnId, productId, productName, qty, unitPrice, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        id,
        item.productId,
        item.productName ?? '',
        Number(item.qty),
        Number(item.unitPrice),
        subtotal,
      ],
    )
  }

  return NextResponse.json({ id, totalRefund, createdAt }, { status: 201 })
}
