import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

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

// POST /api/cash-register/movement
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const body = await req.json() as {
      registerId?: string
      type?: string
      amount?: number
      reason?: string
    }
    const { registerId, type, amount, reason } = body

    if (!registerId) return err('registerId is required')
    if (!type || !['IN', 'OUT'].includes(type)) return err("type must be 'IN' or 'OUT'")
    if (typeof amount !== 'number' || amount <= 0) return err('amount must be a positive number')

    await ensureTables()

    const register = await queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM CashRegister WHERE id = ? LIMIT 1`,
      [registerId]
    )
    if (!register) return err('Cash register not found', 404)
    if (register.status !== 'OPEN') return err('Cash register is already closed', 409)

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO CashMovement (id, registerId, type, amount, reason, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, registerId, type, amount, reason ?? null, now]
    )

    return ok({ id, registerId, type, amount, reason: reason ?? null, createdAt: now }, 201)
  } catch (e: any) {
    console.error('POST /api/cash-register/movement error:', e)
    return err('Internal server error', 500)
  }
}
