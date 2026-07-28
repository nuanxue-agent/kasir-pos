import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export type CashFlowCategory = 'OPERATING' | 'INVESTING' | 'FINANCING'
export type CashFlowType = 'INFLOW' | 'OUTFLOW'

export interface CashFlowEntry {
  id: string
  storeId: string
  category: CashFlowCategory
  type: CashFlowType
  description: string
  amount: number
  period: string
  reference: string | null
  createdAt: string
}

export async function ensureCashFlowTables() {
  await exec(`CREATE TABLE IF NOT EXISTS CashFlowEntry (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'OPERATING',
    type        TEXT NOT NULL DEFAULT 'INFLOW',
    description TEXT NOT NULL DEFAULT '',
    amount      REAL NOT NULL DEFAULT 0,
    period      TEXT NOT NULL,
    reference   TEXT,
    createdAt   TEXT NOT NULL
  )`)
}

// GET /api/cash-flow-entries?storeId=&period=&category=
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCashFlowTables()

  const period = req.nextUrl.searchParams.get('period')
  const category = req.nextUrl.searchParams.get('category')

  let sql = `SELECT * FROM CashFlowEntry WHERE storeId = ?`
  const params: any[] = [storeId]

  if (period) { sql += ` AND period = ?`; params.push(period) }
  if (category) { sql += ` AND category = ?`; params.push(category) }
  sql += ` ORDER BY createdAt DESC`

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}

// POST /api/cash-flow-entries?storeId=
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCashFlowTables()

  const b = (await req.json()) as any

  if (!b.category) return err("Field 'category' is required", 400, 'MISSING_FIELD')
  if (!['OPERATING', 'INVESTING', 'FINANCING'].includes(b.category)) {
    return err("category must be OPERATING, INVESTING, or FINANCING", 400, 'INVALID_FIELD')
  }
  if (!b.type) return err("Field 'type' is required", 400, 'MISSING_FIELD')
  if (!['INFLOW', 'OUTFLOW'].includes(b.type)) {
    return err("type must be INFLOW or OUTFLOW", 400, 'INVALID_FIELD')
  }
  if (!b.description) return err("Field 'description' is required", 400, 'MISSING_FIELD')
  if (!b.period) return err("Field 'period' is required", 400, 'MISSING_FIELD')
  const amount = parseFloat(b.amount)
  if (isNaN(amount) || amount < 0) return err("amount must be a non-negative number", 400, 'INVALID_FIELD')

  const id = newId()
  const now = nowISO()

  await exec(
    `INSERT INTO CashFlowEntry (id, storeId, category, type, description, amount, period, reference, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, b.category, b.type, b.description, amount, b.period, b.reference ?? null, now]
  )

  const rows = await query(`SELECT * FROM CashFlowEntry WHERE id = ?`, [id]) as any[]
  return NextResponse.json(rows[0], { status: 201 })
}
