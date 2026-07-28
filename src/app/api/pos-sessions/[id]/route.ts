// PATCH /api/pos-sessions/[id] — close a POS session
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, nowISO } from '@/lib/db'
import { ensurePOSSessionTables } from '../route'
import { calcSessionExpectedCash, calcSessionVariance } from '@/lib/pos-session'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
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

  await ensurePOSSessionTables()

  const row = await queryOne(`SELECT * FROM POSSession WHERE id = ?`, [id]) as any
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return ok(row)
}

// PATCH — close session with actual cash count
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensurePOSSessionTables()

  const row = await queryOne(`SELECT * FROM POSSession WHERE id = ?`, [id]) as any
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.status === 'CLOSED') return err('Sesi sudah ditutup', 400, 'ALREADY_CLOSED')

  const b = (await req.json()) as any
  const actualCash = Number(b.actualCash)
  if (isNaN(actualCash) || actualCash < 0) return err('actualCash tidak valid', 400, 'INVALID_FIELD')

  // Re-compute expected from movements
  const movements = await query(
    `SELECT * FROM POSCashMovement WHERE sessionId = ?`,
    [id],
  ) as any[]
  const expectedCash = calcSessionExpectedCash(row.openingFloat, movements)
  const variance = calcSessionVariance(expectedCash, actualCash)
  const now = nowISO()

  await exec(
    `UPDATE POSSession SET
       status = 'CLOSED',
       closedAt = ?,
       closingFloat = ?,
       expectedCash = ?,
       actualCash = ?,
       variance = ?
     WHERE id = ?`,
    [now, actualCash, expectedCash, actualCash, variance, id],
  )

  return ok({ ok: true, expectedCash, actualCash, variance })
}
