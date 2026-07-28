import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { ensureCashDrawerTables } from '../../route'
import { buildEODReport } from '@/lib/cash-drawer'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureCashDrawerTables()

  const drawer = await queryOne(`SELECT * FROM CashDrawer WHERE id = ?`, [id]) as any
  if (!drawer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const movements = await query(
    `SELECT * FROM CashMovement WHERE drawerId = ? ORDER BY createdAt ASC`,
    [id],
  ) as any[]

  const report = buildEODReport(drawer, movements)
  return NextResponse.json({ ...report, drawer, movements })
}
