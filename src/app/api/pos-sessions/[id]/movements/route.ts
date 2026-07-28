// GET/POST /api/pos-sessions/[id]/movements — cash movements for a POS session
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensurePOSSessionTables } from '../../route'
import { applyMovement, type POSMovementType } from '@/lib/pos-session'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_TYPES: POSMovementType[] = ['FLOAT', 'SALE', 'REFUND', 'PAY_IN', 'PAY_OUT']

// GET /api/pos-sessions/[id]/movements
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensurePOSSessionTables()

  const posSession = await queryOne(`SELECT id FROM POSSession WHERE id = ?`, [id]) as any
  if (!posSession) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rows = await query(
    `SELECT * FROM POSCashMovement WHERE sessionId = ? ORDER BY createdAt ASC`,
    [id],
  )
  return ok(rows)
}

// POST /api/pos-sessions/[id]/movements — add a cash movement
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensurePOSSessionTables()

  const posSession = await queryOne(`SELECT * FROM POSSession WHERE id = ?`, [id]) as any
  if (!posSession) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (posSession.status === 'CLOSED') return err('Sesi sudah ditutup', 400, 'SESSION_CLOSED')

  const b = (await req.json()) as any
  const type: POSMovementType = b.type
  if (!VALID_TYPES.includes(type)) return err('Tipe tidak valid', 400, 'INVALID_TYPE')

  const amount = Number(b.amount)
  if (isNaN(amount) || amount <= 0) return err('Jumlah tidak valid', 400, 'INVALID_FIELD')

  // Get current balance from last movement
  const last = await queryOne(
    `SELECT balance FROM POSCashMovement WHERE sessionId = ? ORDER BY createdAt DESC LIMIT 1`,
    [id],
  ) as any
  const currentBalance = last ? Number(last.balance) : posSession.openingFloat
  const newBalance = applyMovement(currentBalance, type, amount)

  const movId = newId()
  const now = nowISO()
  await exec(
    `INSERT INTO POSCashMovement (id, sessionId, storeId, type, amount, balance, note, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [movId, id, posSession.storeId, type, amount, newBalance, b.note ?? null, now],
  )

  // Update expectedCash on the session
  const allMovements = await query(
    `SELECT * FROM POSCashMovement WHERE sessionId = ?`,
    [id],
  ) as any[]
  const { calcSessionExpectedCash } = await import('@/lib/pos-session')
  const expectedCash = calcSessionExpectedCash(posSession.openingFloat, allMovements)
  await exec(`UPDATE POSSession SET expectedCash = ? WHERE id = ?`, [expectedCash, id])

  return ok({ id: movId, balance: newBalance }, 201)
}
