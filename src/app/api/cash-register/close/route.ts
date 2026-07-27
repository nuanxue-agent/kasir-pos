import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, nowISO } from '@/lib/db'

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

// POST /api/cash-register/close
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const body = await req.json() as { registerId?: string; closingActual?: number }
    const { registerId, closingActual } = body

    if (!registerId) return err('registerId is required')
    if (typeof closingActual !== 'number' || closingActual < 0) {
      return err('closingActual must be a non-negative number')
    }

    await ensureTables()

    const register = await queryOne<{
      id: string
      storeId: string
      employeeId: string
      openedAt: string
      openingFloat: number
      status: string
    }>(
      `SELECT * FROM CashRegister WHERE id = ? LIMIT 1`,
      [registerId]
    )
    if (!register) return err('Cash register not found', 404)
    if (register.status !== 'OPEN') return err('Cash register is already closed', 409)

    // Aggregate movements
    const movements = await query<{ type: string; amount: number }>(
      `SELECT type, amount FROM CashMovement WHERE registerId = ?`,
      [registerId]
    )
    const cashIn = movements.filter(m => m.type === 'IN').reduce((s, m) => s + m.amount, 0)
    const cashOut = movements.filter(m => m.type === 'OUT').reduce((s, m) => s + m.amount, 0)

    // Cash sales from completed orders
    const salesRow = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(total), 0) as total
       FROM "Order"
       WHERE storeId = ?
         AND paymentMethod = 'CASH'
         AND status = 'COMPLETED'
         AND createdAt >= ?`,
      [register.storeId, register.openedAt]
    ).catch(() => ({ total: 0 }))

    const cashSales = salesRow?.total ?? 0
    const closingExpected = register.openingFloat + cashSales + cashIn - cashOut
    const variance = closingActual - closingExpected
    const now = nowISO()

    await exec(
      `UPDATE CashRegister
       SET closedAt = ?, closingActual = ?, closingExpected = ?, variance = ?, status = 'CLOSED'
       WHERE id = ?`,
      [now, closingActual, closingExpected, variance, registerId]
    )

    // Build shift summary data
    const allOrders = await query<{
      total: number
      paymentMethod: string
    }>(
      `SELECT total, paymentMethod FROM "Order"
       WHERE storeId = ?
         AND status = 'COMPLETED'
         AND createdAt >= ?`,
      [register.storeId, register.openedAt]
    ).catch(() => [])

    const totalOrders = allOrders.length
    const totalSales = allOrders.reduce((s, o) => s + (o.total ?? 0), 0)
    const cashSalesTotal = allOrders
      .filter(o => o.paymentMethod === 'CASH')
      .reduce((s, o) => s + (o.total ?? 0), 0)
    const cardSalesTotal = allOrders
      .filter(o => ['CARD', 'QRIS', 'TRANSFER'].includes(o.paymentMethod))
      .reduce((s, o) => s + (o.total ?? 0), 0)
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0

    return ok({
      registerId,
      closedAt: now,
      openingFloat: register.openingFloat,
      cashSales,
      cashIn,
      cashOut,
      closingExpected,
      closingActual,
      variance,
      status: 'CLOSED',
      summary: {
        totalOrders,
        totalSales,
        cashSalesTotal,
        cardSalesTotal,
        avgOrderValue,
        openedAt: register.openedAt,
        closedAt: now,
      },
    })
  } catch (e: any) {
    console.error('POST /api/cash-register/close error:', e)
    return err('Internal server error', 500)
  }
}
