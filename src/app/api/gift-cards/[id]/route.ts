import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { validateGiftCardRedemption, deductGiftCardBalance } from '@/lib/gift-cards'
import { ensureGiftCardTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  await ensureGiftCardTables()

  const card = (await queryOne(`SELECT * FROM GiftCard WHERE id = ?`, [id])) as any
  if (!card) return err('Gift card tidak ditemukan', 404, 'NOT_FOUND')

  const storeId = card.storeId
  const b = (await req.json()) as any
  const t = nowISO()

  // --- RELOAD ---
  if (b.type === 'RELOAD') {
    const amount = Number(b.amount ?? 0)
    if (amount <= 0) return err('amount must be positive', 400, 'MISSING_FIELD')
    if (card.status === 'DISABLED') return err('Gift card dinonaktifkan', 400, 'INVALID_STATE')

    const newBalance = card.balance + amount
    await exec(`UPDATE GiftCard SET balance = ?, status = 'ACTIVE', updatedAt = ? WHERE id = ?`, [newBalance, t, id])
    await exec(
      `INSERT INTO GiftCardTransaction (id, cardId, storeId, type, amount, orderId, note, createdAt) VALUES (?, ?, ?, 'RELOAD', ?, ?, ?, ?)`,
      [newId(), id, storeId, amount, b.orderId ?? null, b.note ?? null, t],
    )
    return NextResponse.json({ ok: true, balance: newBalance })
  }

  // --- REDEEM ---
  if (b.type === 'REDEEM') {
    const amount = Number(b.amount ?? 0)
    const validationErr = validateGiftCardRedemption(card.status, card.balance, amount)
    if (validationErr) return err(validationErr, 400, 'INVALID_REDEMPTION')

    const { newBalance, applied } = deductGiftCardBalance(card.balance, amount)
    const newStatus = newBalance <= 0 ? 'REDEEMED' : 'ACTIVE'
    await exec(`UPDATE GiftCard SET balance = ?, status = ?, updatedAt = ? WHERE id = ?`, [newBalance, newStatus, t, id])
    await exec(
      `INSERT INTO GiftCardTransaction (id, cardId, storeId, type, amount, orderId, note, createdAt) VALUES (?, ?, ?, 'REDEEM', ?, ?, ?, ?)`,
      [newId(), id, storeId, applied, b.orderId ?? null, b.note ?? null, t],
    )
    return NextResponse.json({ ok: true, applied, balance: newBalance, status: newStatus })
  }

  // --- REFUND ---
  if (b.type === 'REFUND') {
    const amount = Number(b.amount ?? 0)
    if (amount <= 0) return err('amount must be positive', 400, 'MISSING_FIELD')
    if (card.status === 'DISABLED') return err('Gift card dinonaktifkan', 400, 'INVALID_STATE')

    const newBalance = card.balance + amount
    await exec(`UPDATE GiftCard SET balance = ?, status = 'ACTIVE', updatedAt = ? WHERE id = ?`, [newBalance, t, id])
    await exec(
      `INSERT INTO GiftCardTransaction (id, cardId, storeId, type, amount, orderId, note, createdAt) VALUES (?, ?, ?, 'REFUND', ?, ?, ?, ?)`,
      [newId(), id, storeId, amount, b.orderId ?? null, b.note ?? null, t],
    )
    return NextResponse.json({ ok: true, balance: newBalance })
  }

  // --- STATUS UPDATE (enable/disable/expire) ---
  if (b.status !== undefined) {
    const allowed = ['ACTIVE', 'DISABLED', 'EXPIRED']
    if (!allowed.includes(b.status)) return err('Invalid status', 400, 'INVALID_FIELD')
    await exec(`UPDATE GiftCard SET status = ?, updatedAt = ? WHERE id = ?`, [b.status, t, id])
    return NextResponse.json({ ok: true })
  }

  // --- GENERIC FIELD UPDATE (expiryDate, issuedTo) ---
  const sets: string[] = []
  const vals: any[] = []
  if (b.expiryDate !== undefined) { sets.push('expiryDate = ?'); vals.push(b.expiryDate) }
  if (b.issuedTo !== undefined) { sets.push('issuedTo = ?'); vals.push(b.issuedTo) }
  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')
  sets.push('updatedAt = ?'); vals.push(t); vals.push(id)
  await exec(`UPDATE GiftCard SET ${sets.join(', ')} WHERE id = ?`, vals)
  return NextResponse.json({ ok: true })
}
