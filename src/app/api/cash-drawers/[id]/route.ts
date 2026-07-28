import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, nowISO } from '@/lib/db'
import { ensureCashDrawerTables } from '../route'
import { calcExpectedCash, calcVariance } from '@/lib/cash-drawer'

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

  const row = await queryOne(`SELECT * FROM CashDrawer WHERE id = ?`, [id]) as any
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(row)
}

// PATCH — close drawer with actual cash amount
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  await ensureCashDrawerTables()

  const drawer = await queryOne(`SELECT * FROM CashDrawer WHERE id = ?`, [id]) as any
  if (!drawer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (drawer.status === 'CLOSED') return err('Laci kasir sudah ditutup', 400, 'ALREADY_CLOSED')

  const b = (await req.json()) as any
  const actualCash = Number(b.actualCash)
  if (isNaN(actualCash) || actualCash < 0) return err('actualCash tidak valid', 400, 'INVALID_FIELD')

  // Re-compute expected from movements
  const movements = await query(
    `SELECT * FROM CashMovement WHERE drawerId = ?`,
    [id],
  ) as any[]
  const expectedCash = calcExpectedCash(drawer.openingFloat, movements)
  const variance = calcVariance(expectedCash, actualCash)

  const now = nowISO()
  const closedBy = (user as any).name ?? (user as any).email ?? null

  await exec(
    `UPDATE CashDrawer SET
       status = 'CLOSED',
       closedAt = ?,
       expectedCash = ?,
       actualCash = ?,
       variance = ?,
       closedBy = ?
     WHERE id = ?`,
    [now, expectedCash, actualCash, variance, closedBy, id],
  )

  return NextResponse.json({ ok: true, expectedCash, actualCash, variance })
}
