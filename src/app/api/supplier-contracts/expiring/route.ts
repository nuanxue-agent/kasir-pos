import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureSupplierContractTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10)

  await ensureSupplierContractTables()

  // Contracts that are ACTIVE or DRAFT and end within the next N days
  const rows = await query(
    `SELECT sc.*, v.name as vendorName
     FROM SupplierContract sc
     LEFT JOIN Vendor v ON sc.vendorId = v.id
     WHERE sc.storeId = ?
       AND sc.status IN ('ACTIVE', 'DRAFT')
       AND date(sc.endDate) >= date('now')
       AND date(sc.endDate) <= date('now', ? || ' days')
     ORDER BY sc.endDate ASC`,
    [storeId, String(days)],
  ).catch(() => [])

  return NextResponse.json(rows)
}
