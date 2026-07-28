import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureIntercompanyTable(): Promise<void> {
  await exec(`
    CREATE TABLE IF NOT EXISTS IntercompanyTransaction (
      id              TEXT PRIMARY KEY,
      fromStoreId     TEXT NOT NULL,
      toStoreId       TEXT NOT NULL,
      type            TEXT NOT NULL CHECK(type IN ('SALE','LOAN','EXPENSE_SHARE','DIVIDEND')),
      amount          REAL NOT NULL,
      description     TEXT,
      status          TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED','SETTLED')),
      transactionDate TEXT NOT NULL,
      settledAt       TEXT,
      createdAt       TEXT NOT NULL,
      updatedAt       TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureIntercompanyTable()

    const status = sp.get('status')
    const type = sp.get('type')

    let sql = `SELECT * FROM IntercompanyTransaction WHERE (fromStoreId = ? OR toStoreId = ?)`
    const params: any[] = [storeId, storeId]

    if (status) { sql += ` AND status = ?`; params.push(status) }
    if (type)   { sql += ` AND type = ?`;   params.push(type) }

    sql += ` ORDER BY transactionDate DESC, createdAt DESC`

    const rows = await query(sql, params) as any[]
    return ok({ transactions: rows, total: rows.length })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const body = await req.json() as any
    const { fromStoreId, toStoreId, type, amount, description, transactionDate } = body

    if (!fromStoreId || !toStoreId) return err('fromStoreId and toStoreId required')
    if (fromStoreId === toStoreId)  return err('fromStoreId and toStoreId must differ')
    if (!['SALE','LOAN','EXPENSE_SHARE','DIVIDEND'].includes(type)) return err('Invalid type')
    if (typeof amount !== 'number' || amount <= 0) return err('amount must be a positive number')
    if (!transactionDate) return err('transactionDate required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === fromStoreId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureIntercompanyTable()

    const id  = newId()
    const now = nowISO()

    await exec(
      `INSERT INTO IntercompanyTransaction
         (id, fromStoreId, toStoreId, type, amount, description, status, transactionDate, settledAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, NULL, ?, ?)`,
      [id, fromStoreId, toStoreId, type, amount, description ?? null, transactionDate, now, now],
    )

    const created = await query(`SELECT * FROM IntercompanyTransaction WHERE id = ?`, [id]) as any[]
    return ok(created[0], 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
