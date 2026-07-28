import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { buildDjpCsv } from '@/lib/e-faktur'
import { ensureEFakturTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  // Optional filters
  const status = req.nextUrl.searchParams.get('status') ?? 'DRAFT'
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')

  await ensureEFakturTables()

  let sql = `SELECT * FROM EFaktur WHERE storeId = ? AND status = ?`
  const params: any[] = [storeId, status]

  if (from) { sql += ` AND createdAt >= ?`; params.push(from) }
  if (to)   { sql += ` AND createdAt <= ?`; params.push(to + 'T23:59:59.999Z') }

  sql += ` ORDER BY createdAt ASC`

  const rows = await query(sql, params)

  const csv = buildDjpCsv(rows as any[])

  const filename = `e-faktur-${storeId}-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
