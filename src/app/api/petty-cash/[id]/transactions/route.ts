// GET/POST /api/petty-cash/[id]/transactions
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensurePettyCashTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/petty-cash/[id]/transactions?storeId=&month=YYYY-MM
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

    await ensurePettyCashTables()

    const month = req.nextUrl.searchParams.get('month') // 'YYYY-MM' optional

    let rows: any[]
    if (month) {
      rows = await query(
        `SELECT * FROM PettyCashTransaction
         WHERE fundId = ? AND storeId = ? AND createdAt LIKE ?
         ORDER BY createdAt DESC`,
        [fundId, storeId, `${month}%`],
      )
    } else {
      rows = await query(
        `SELECT * FROM PettyCashTransaction
         WHERE fundId = ? AND storeId = ?
         ORDER BY createdAt DESC`,
        [fundId, storeId],
      )
    }

    return ok((rows as any[]).map(r => ({ ...r, amount: Number(r.amount) })))
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

// POST /api/petty-cash/[id]/transactions — record an expense
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

    const fund = await queryOne(`SELECT * FROM PettyCashFund WHERE id = ? AND storeId = ?`, [fundId, storeId]) as any
    if (!fund) return err('Fund not found', 404)
    if (!fund.active) return err('Fund is inactive')

    const b = (await req.json()) as any
    if (!b.amount || Number(b.amount) <= 0) return err("Field 'amount' must be positive")
    if (!b.category) return err("Field 'category' is required")
    if (!b.description) return err("Field 'description' is required")

    const amount = Number(b.amount)
    const type: string = b.type ?? 'EXPENSE'

    if (type === 'EXPENSE' && amount > Number(fund.balance)) {
      return err('Insufficient fund balance')
    }

    const newBalance =
      type === 'EXPENSE'
        ? Number(fund.balance) - amount
        : Math.min(Number(fund.balance) + amount, Number(fund.maxBalance))

    const t = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO PettyCashTransaction
         (id, fundId, storeId, type, amount, category, description, receiptNumber, createdBy, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        fundId,
        storeId,
        type,
        amount,
        b.category,
        b.description,
        b.receiptNumber ?? '',
        (user as any).name ?? (user as any).email ?? '',
        t,
      ],
    )

    await exec(
      `UPDATE PettyCashFund SET balance = ?, updatedAt = ? WHERE id = ?`,
      [newBalance, t, fundId],
    )

    return ok({ id, newBalance }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
