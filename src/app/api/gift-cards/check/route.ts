import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'
import { resolveGiftCardStatus } from '@/lib/gift-cards'
import { ensureGiftCardTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  await ensureGiftCardTables()

  const b = (await req.json()) as any
  if (!b.code) return err('code required', 400, 'MISSING_FIELD')

  const card = (await queryOne(`SELECT * FROM GiftCard WHERE code = ?`, [b.code.toUpperCase()])) as any
  if (!card) return err('Gift card tidak ditemukan', 404, 'NOT_FOUND')

  // Auto-update status if expired
  const computedStatus = resolveGiftCardStatus(card.balance, card.expiryDate)
  if (computedStatus === 'EXPIRED' && card.status === 'ACTIVE') {
    await exec(`UPDATE GiftCard SET status = 'EXPIRED', updatedAt = datetime('now') WHERE id = ?`, [card.id])
    card.status = 'EXPIRED'
  }

  return NextResponse.json({
    id: card.id,
    code: card.code,
    balance: card.balance,
    initialBalance: card.initialBalance,
    status: card.status,
    expiryDate: card.expiryDate,
    issuedTo: card.issuedTo,
  })
}
