// GET /api/stock-age/summary?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { calcAgeDays, classifyAgeBucket, calcAgingValue } from '@/components/inventory/StockAgeClient'
import { ensureStockAgeTable } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureStockAgeTable()

  const rows = await query(`
    SELECT id, receivedAt, qty, cost
    FROM StockAge
    WHERE storeId = ?
  `, [storeId]) as any[]

  const now = new Date()

  const summary = {
    bucket0_30:  { count: 0, value: 0, qty: 0 },
    bucket31_60: { count: 0, value: 0, qty: 0 },
    bucket61_90: { count: 0, value: 0, qty: 0 },
    bucket90plus: { count: 0, value: 0, qty: 0 },
    totalValue: 0,
    totalItems: 0,
  }

  for (const row of rows) {
    const ageDays    = calcAgeDays(row.receivedAt, now)
    const bucket     = classifyAgeBucket(ageDays)
    const agingValue = calcAgingValue(Number(row.qty), Number(row.cost))

    summary.totalValue += agingValue
    summary.totalItems += 1

    const key =
      bucket === '0-30'  ? 'bucket0_30' :
      bucket === '31-60' ? 'bucket31_60' :
      bucket === '61-90' ? 'bucket61_90' :
      'bucket90plus'

    summary[key].count += 1
    summary[key].value += agingValue
    summary[key].qty   += Number(row.qty)
  }

  return NextResponse.json(summary)
}
