// GET/POST /api/petty-cash-funds/[id]/transactions
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensurePettyCashFundTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/petty-cash-funds/[id]/transactions?storeId=xxx
export async function GET(
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

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensurePettyCashFundTables()

    const rows = await query(
      `SELECT * FROM PettyCashTransaction2 WHERE fundId = ? AND storeId = ? ORDER BY createdAt DESC`,
      [fundId, storeId],
    )

    const txs = (rows as any[]).map(r => ({
      ...r,
      amount: Number(r.amount),
      balance: Number(r.balance),
    }))

    return ok(txs)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

// POST /api/petty-cash-funds/[id]/transactions?storeId=xxx
// Body: { type, amount, description, category?, receiptNo?, requestedBy? }
// type: REPLENISH | EXPENSE | ADVANCE | SETTLEMENT
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

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensurePettyCashFundTables()

    const b = (await req.json()) as any
    if (!b.type) return err("Field 'type' is required")
    if (!b.amount || Number(b.amount) <= 0) return err("Field 'amount' must be positive")
    if (!b.description) return err("Field 'description' is required")

    const VALID_TYPES = ['REPLENISH', 'EXPENSE', 'ADVANCE', 'SETTLEMENT']
    if (!VALID_TYPES.includes(b.type)) return err(`Invalid type: ${b.type}`)

    // Load current fund to calculate running balance
    const fundRows = await query(
      `SELECT balance FROM PettyCashFund2 WHERE id = ? AND storeId = ?`,
      [fundId, storeId],
    )
    if (!(fundRows as any[]).length) return err('Fund not found', 404)

    const currentBalance = Number((fundRows as any[])[0].balance)
    const amount = Number(b.amount)

    let newBalance: number
    if (b.type === 'REPLENISH') {
      newBalance = currentBalance + amount
    } else {
      newBalance = currentBalance - amount
    }

    // ADVANCE starts PENDING and doesn't deduct balance until APPROVED
    const isAdvance = b.type === 'ADVANCE'
    const initialStatus = isAdvance ? 'PENDING' : 'APPROVED'
    // For advances, balance doesn't change until approval
    const txBalance = isAdvance ? currentBalance : newBalance

    const t = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO PettyCashTransaction2
         (id, fundId, storeId, type, amount, balance, description, category, receiptNo, requestedBy, approvedBy, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
      [
        id, fundId, storeId, b.type, amount, txBalance,
        b.description, b.category ?? 'Umum', b.receiptNo ?? '',
        b.requestedBy ?? '', initialStatus, t,
      ],
    )

    // Update fund balance (advances don't move balance until APPROVED)
    if (!isAdvance) {
      await exec(
        `UPDATE PettyCashFund2 SET balance = ?, updatedAt = ? WHERE id = ?`,
        [newBalance, t, fundId],
      )
    }

    return ok({ id, balance: txBalance }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
