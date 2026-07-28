import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensureGiftCardTables } from '../../route'

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

  await ensureGiftCardTables()

  const card = (await queryOne(`SELECT * FROM GiftCard WHERE id = ?`, [id])) as any
  if (!card) return err('Gift card tidak ditemukan', 404, 'NOT_FOUND')

  const txns = await query(
    `SELECT * FROM GiftCardTransaction WHERE cardId = ? ORDER BY createdAt DESC`,
    [id],
  )
  return NextResponse.json(txns)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureGiftCardTables()

  const card = (await queryOne(`SELECT * FROM GiftCard WHERE id = ?`, [id])) as any
  if (!card) return err('Gift card tidak ditemukan', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const validTypes = ['ISSUE', 'RELOAD', 'REDEEM', 'REFUND']
  if (!b.type || !validTypes.includes(b.type)) return err('type must be one of ISSUE/RELOAD/REDEEM/REFUND', 400, 'MISSING_FIELD')

  const amount = Number(b.amount ?? 0)
  if (amount <= 0) return err('amount must be positive', 400, 'MISSING_FIELD')

  const txId = newId()
  const t = nowISO()
  await exec(
    `INSERT INTO GiftCardTransaction (id, cardId, storeId, type, amount, orderId, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [txId, id, card.storeId, b.type, amount, b.orderId ?? null, b.note ?? null, t],
  )

  return NextResponse.json({ id: txId }, { status: 201 })
}
