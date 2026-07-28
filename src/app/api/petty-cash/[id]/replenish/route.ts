// POST /api/petty-cash/[id]/replenish — request a top-up
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensurePettyCashTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// POST /api/petty-cash/[id]/replenish
// body: { amount: number, description?: string, receiptNumber?: string }
// Adds REPLENISHMENT transaction and increases fund balance (capped at maxBalance)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id: fundId } = await params
    const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensurePettyCashTables()

    const fund = await queryOne(
      `SELECT * FROM PettyCashFund WHERE id = ? AND storeId = ?`,
      [fundId, storeId],
    ) as any
    if (!fund) return err('Fund not found', 404)
    if (!fund.active) return err('Fund is inactive')

    const b = (await req.json()) as any
    const amount = Number(b.amount)
    if (!amount || amount <= 0) return err("Field 'amount' must be positive")

    const currentBalance = Number(fund.balance)
    const maxBalance = Number(fund.maxBalance)
    const newBalance = Math.min(currentBalance + amount, maxBalance)
    const actualAmount = newBalance - currentBalance // may be less than requested if capped

    const t = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO PettyCashTransaction
         (id, fundId, storeId, type, amount, category, description, receiptNumber, createdBy, createdAt)
       VALUES (?, ?, ?, 'REPLENISHMENT', ?, 'Replenishment', ?, ?, ?, ?)`,
      [
        id,
        fundId,
        storeId,
        actualAmount,
        b.description ?? 'Pengisian kas kecil',
        b.receiptNumber ?? '',
        (user as any).name ?? (user as any).email ?? '',
        t,
      ],
    )

    await exec(
      `UPDATE PettyCashFund SET balance = ?, updatedAt = ? WHERE id = ?`,
      [newBalance, t, fundId],
    )

    return ok({ id, newBalance, amountAdded: actualAmount }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
