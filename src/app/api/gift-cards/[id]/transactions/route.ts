import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/gift-cards/[id]/transactions
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureTables()

    const card = await query(`SELECT id FROM GiftCard WHERE id = ?`, [id])
    if (card.length === 0) return err('Not found', 404)

    const rows = await query(
      `SELECT * FROM GiftCardTransaction WHERE cardId = ? ORDER BY createdAt DESC`,
      [id]
    )
    return ok(rows)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/gift-cards/[id]/transactions
// Body: { type: 'REFUND'|'VOID', amount?, orderId?, note? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureTables()

    const rows = await query(`SELECT * FROM GiftCard WHERE id = ?`, [id])
    if (rows.length === 0) return err('Not found', 404)
    const card = rows[0] as any

    const b = (await req.json()) as any
    const VALID_TYPES = ['REFUND', 'VOID']
    if (!b.type || !VALID_TYPES.includes(b.type)) return err(`type must be one of: ${VALID_TYPES.join(', ')}`)

    if (card.status === 'VOIDED') return err('Card is already voided')

    const t = nowISO()
    const txId = newId()
    let newBalance = card.currentBalance
    let newStatus = card.status

    if (b.type === 'REFUND') {
      const amount = Number(b.amount ?? 0)
      if (amount <= 0) return err('amount must be > 0 for REFUND')
      newBalance = Math.min(card.initialBalance, card.currentBalance + amount)
      if (newBalance > 0) newStatus = 'ACTIVE'
      await exec(
        `INSERT INTO GiftCardTransaction (id, cardId, storeId, type, amount, balance, orderId, createdAt)
         VALUES (?, ?, ?, 'REFUND', ?, ?, ?, ?)`,
        [txId, id, card.storeId, amount, newBalance, b.orderId ?? null, t]
      )
    } else {
      // VOID
      newBalance = 0
      newStatus = 'VOIDED'
      await exec(
        `INSERT INTO GiftCardTransaction (id, cardId, storeId, type, amount, balance, orderId, createdAt)
         VALUES (?, ?, ?, 'VOID', ?, 0, ?, ?)`,
        [txId, id, card.storeId, card.currentBalance, b.orderId ?? null, t]
      )
    }

    await exec(
      `UPDATE GiftCard SET currentBalance = ?, status = ?, updatedAt = ? WHERE id = ?`,
      [newBalance, newStatus, t, id]
    )

    return ok({ id: txId, balance: newBalance, status: newStatus }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
