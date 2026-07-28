import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureCurrencyTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCurrencyTables()

  const from = sp.get('from')
  const to = sp.get('to')
  const since = sp.get('since')
  const until = sp.get('until')
  const limit = Math.min(parseInt(sp.get('limit') ?? '100', 10), 500)

  let sql = `SELECT * FROM ExchangeRateHistory WHERE storeId = ?`
  const vals: any[] = [storeId]

  if (from) { sql += ` AND fromCurrency = ?`; vals.push(from.toUpperCase()) }
  if (to) { sql += ` AND toCurrency = ?`; vals.push(to.toUpperCase()) }
  if (since) { sql += ` AND recordedAt >= ?`; vals.push(since) }
  if (until) { sql += ` AND recordedAt <= ?`; vals.push(until) }

  sql += ` ORDER BY recordedAt DESC LIMIT ?`
  vals.push(limit)

  const rows = await query(sql, vals)
  return NextResponse.json(rows)
}
