import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensureCashDrawerTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_TYPES = ['SALE', 'REFUND', 'PAYOUT', 'FLOAT_ADD']

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureCashDrawerTables()

  const sp = req.nextUrl.searchParams
  const type = sp.get('type')

  let sql = `SELECT * FROM CashMovement WHERE drawerId = ?`
  const vals: any[] = [id]
  if (type && VALID_TYPES.includes(type)) {
    sql += ` AND type = ?`
    vals.push(type)
  }
  sql += ` ORDER BY createdAt DESC`

  const rows = await query(sql, vals)
  return NextResponse.json(rows)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureCashDrawerTables()

  const drawer = await queryOne(`SELECT * FROM CashDrawer WHERE id = ?`, [id]) as any
  if (!drawer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (drawer.status === 'CLOSED') return err('Laci kasir sudah ditutup', 400, 'DRAWER_CLOSED')

  const b = (await req.json()) as any
  if (!b.type || !VALID_TYPES.includes(b.type)) {
    return err(`type harus salah satu dari: ${VALID_TYPES.join(', ')}`, 400, 'INVALID_FIELD')
  }
  const amount = Number(b.amount)
  if (isNaN(amount) || amount <= 0) return err('amount harus positif', 400, 'INVALID_FIELD')

  const movId = newId()
  const now = nowISO()
  await exec(
    `INSERT INTO CashMovement (id, drawerId, storeId, type, amount, reference, note, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [movId, id, drawer.storeId, b.type, amount, b.reference ?? null, b.note ?? null, now],
  )

  return NextResponse.json({ id: movId }, { status: 201 })
}
