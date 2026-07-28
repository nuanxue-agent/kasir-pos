import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// POST /api/gift-cards/redeem
// Body: { code, amount, orderId?, storeId? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id

    await ensureTables()

    const b = (await req.json()) as any
    if (!b.code?.trim()) return err('code is required')
    if (!b.amount || Number(b.amount) <= 0) return err('amount must be > 0')

    const amount = Number(b.amount)
    const code = b.code.trim().toUpperCase()

    const rows = await query(`SELECT * FROM GiftCard WHERE code = ?`, [code])
    if (rows.length === 0) return err('Gift card not found', 404)
    const card = rows[0] as any

    // Use storeId from card if not provided in request
    const cardStoreId = storeId ?? card.storeId

    if (card.status === 'VOIDED') return err('Gift card has been voided')
    if (card.status === 'REDEEMED') return err('Gift card has already been fully redeemed')
    if (card.status === 'EXPIRED') return err('Gift card has expired')

    // Check expiry
    if (card.expiresAt && new Date(card.expiresAt) < new Date()) {
      const t = nowISO()
      await exec(`UPDATE GiftCard SET status = 'EXPIRED', updatedAt = ? WHERE id = ?`, [t, card.id])
      return err('Gift card has expired')
    }

    if (card.status !== 'ACTIVE') return err('Gift card is not active')
    if (card.currentBalance <= 0) return err('Gift card has no remaining balance')
    if (amount > card.currentBalance) return err(`Insufficient balance. Available: ${card.currentBalance}`)

    const t = nowISO()
    const newBalance = card.currentBalance - amount
    const newStatus = newBalance === 0 ? 'REDEEMED' : 'ACTIVE'

    await exec(
      `UPDATE GiftCard SET currentBalance = ?, status = ?, updatedAt = ? WHERE id = ?`,
      [newBalance, newStatus, t, card.id]
    )

    const txId = newId()
    await exec(
      `INSERT INTO GiftCardTransaction (id, cardId, storeId, type, amount, balance, orderId, createdAt)
       VALUES (?, ?, ?, 'REDEEM', ?, ?, ?, ?)`,
      [txId, card.id, cardStoreId, amount, newBalance, b.orderId ?? null, t]
    )

    return ok({
      transactionId: txId,
      cardId: card.id,
      code: card.code,
      amountRedeemed: amount,
      remainingBalance: newBalance,
      status: newStatus,
    })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
