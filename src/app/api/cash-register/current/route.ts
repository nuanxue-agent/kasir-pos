import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec } from '@/lib/db'

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

// GET /api/cash-register/current?storeId=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return err('storeId is required')

    await ensureTables()

    const register = await queryOne<{
      id: string
      storeId: string
      employeeId: string
      openedAt: string
      closedAt: string | null
      openingFloat: number
      closingActual: number | null
      closingExpected: number | null
      variance: number | null
      status: string
    }>(
      `SELECT * FROM CashRegister WHERE storeId = ? AND status = 'OPEN' ORDER BY openedAt DESC LIMIT 1`,
      [storeId]
    )

    if (!register) return ok(null)

    // Load movements
    const movements = await query<{
      id: string
      registerId: string
      type: string
      amount: number
      reason: string | null
      createdAt: string
    }>(
      `SELECT * FROM CashMovement WHERE registerId = ? ORDER BY createdAt ASC`,
      [register.id]
    )

    // Load cash sales from Order table for this shift window
    const cashSalesResult = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(total), 0) as total
       FROM "Order"
       WHERE storeId = ?
         AND paymentMethod = 'CASH'
         AND status = 'COMPLETED'
         AND createdAt >= ?`,
      [storeId, register.openedAt]
    ).catch(() => ({ total: 0 }))

    const cashSales = cashSalesResult?.total ?? 0
    const cashOut = movements
      .filter(m => m.type === 'OUT')
      .reduce((s, m) => s + m.amount, 0)
    const cashIn = movements
      .filter(m => m.type === 'IN')
      .reduce((s, m) => s + m.amount, 0)

    const expectedCash = register.openingFloat + cashSales + cashIn - cashOut

    return ok({ ...register, movements, cashSales, cashIn, cashOut, expectedCash })
  } catch (e: any) {
    console.error('GET /api/cash-register/current error:', e)
    return err('Internal server error', 500)
  }
}
