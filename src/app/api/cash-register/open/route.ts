import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// Lazy-init CashRegister + CashMovement tables
async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CashRegister (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      employeeId TEXT NOT NULL,
      openedAt TEXT NOT NULL,
      closedAt TEXT,
      openingFloat REAL NOT NULL DEFAULT 0,
      closingActual REAL,
      closingExpected REAL,
      variance REAL,
      status TEXT NOT NULL DEFAULT 'OPEN'
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS CashMovement (
      id TEXT PRIMARY KEY,
      registerId TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      createdAt TEXT NOT NULL
    )
  `)
}

// POST /api/cash-register/open
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const body = await req.json() as { storeId?: string; openingFloat?: number }
    const { storeId, openingFloat = 0 } = body

    if (!storeId) return err('storeId is required')
    if (typeof openingFloat !== 'number' || openingFloat < 0) {
      return err('openingFloat must be a non-negative number')
    }

    await ensureTables()

    // Check for already-open register
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM CashRegister WHERE storeId = ? AND status = 'OPEN' LIMIT 1`,
      [storeId]
    )
    if (existing) return err('A cash register is already open for this store', 409)

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO CashRegister (id, storeId, employeeId, openedAt, openingFloat, status)
       VALUES (?, ?, ?, ?, ?, 'OPEN')`,
      [id, storeId, user.id, now, openingFloat]
    )

    return ok({ id, storeId, employeeId: user.id, openedAt: now, openingFloat, status: 'OPEN' }, 201)
  } catch (e: any) {
    console.error('POST /api/cash-register/open error:', e)
    return err('Internal server error', 500)
  }
}
