// GET /api/tier-history?storeId=&customerId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureTierTables } from '../tier-rules/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const customerId = req.nextUrl.searchParams.get('customerId')

  await ensureTierTables()

  let sql = `SELECT h.*, c.name as customerName
             FROM TierHistory h
             LEFT JOIN Customer c ON c.id = h.customerId
             WHERE h.storeId = ?`
  const args: any[] = [storeId]

  if (customerId) {
    sql += ` AND h.customerId = ?`
    args.push(customerId)
  }

  sql += ` ORDER BY h.changedAt DESC LIMIT 200`

  const rows = await query(sql, args)
  return NextResponse.json(rows)
}
