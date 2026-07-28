import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS SplitBill (
    id TEXT PRIMARY KEY,
    orderId TEXT NOT NULL,
    storeId TEXT NOT NULL,
    splitCount INTEGER NOT NULL DEFAULT 2,
    method TEXT NOT NULL DEFAULT 'EQUAL',
    status TEXT NOT NULL DEFAULT 'PENDING',
    createdAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS SplitBillPayer (
    id TEXT PRIMARY KEY,
    splitId TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'Tamu',
    amount REAL NOT NULL DEFAULT 0,
    paid INTEGER NOT NULL DEFAULT 0,
    paidAt TEXT,
    paymentMethod TEXT,
    itemIds TEXT
  )`)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const { id: orderId } = await params

    const body = await req.json() as any
    const { method = 'EQUAL', count = 2, payers = [] } = body

    if (!['EQUAL', 'CUSTOM', 'BY_ITEM'].includes(method))
      return err('method must be EQUAL, CUSTOM, or BY_ITEM')
    if (!orderId) return err('orderId required')

    await ensureTables()

    // Fetch storeId from order
    const order = await queryOne<{ storeId: string; total: number }>(
      `SELECT storeId, total FROM "Order" WHERE id = ?`,
      [orderId]
    ).catch(() => null)
    const storeId = (order as any)?.storeId ?? ''

    const splitId = newId()
    await exec(
      `INSERT INTO SplitBill (id, orderId, storeId, splitCount, method, status, createdAt)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      [splitId, orderId, storeId, count, method, nowISO()]
    )

    for (const p of payers) {
      const payerId = newId()
      await exec(
        `INSERT INTO SplitBillPayer (id, splitId, name, amount, paid, paidAt, paymentMethod, itemIds)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payerId, splitId,
          p.name ?? 'Tamu',
          p.amount ?? 0,
          p.paid ? 1 : 0,
          p.paidAt ?? null,
          p.paymentMethod ?? null,
          p.items ? JSON.stringify(p.items) : null,
        ]
      )
    }

    const split = await queryOne(`SELECT * FROM SplitBill WHERE id = ?`, [splitId])
    const payerRows = await query(`SELECT * FROM SplitBillPayer WHERE splitId = ?`, [splitId])

    return ok({ data: { ...split, payers: payerRows } }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const { id: orderId } = await params

    await ensureTables()

    const split = await queryOne(`SELECT * FROM SplitBill WHERE orderId = ? ORDER BY createdAt DESC`, [orderId])
    if (!split) return err('Not found', 404)

    const payers = await query(`SELECT * FROM SplitBillPayer WHERE splitId = ?`, [(split as any).id])
    return ok({ data: { ...split, payers } })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
