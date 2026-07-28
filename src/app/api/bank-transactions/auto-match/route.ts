// POST /api/bank-transactions/auto-match
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

interface BankTx {
  id: string
  date: string
  amount: number
  type: string
  status: string
}

interface OrderRow {
  id: string
  date: string
  total: number
  type: string
}

function tryAutoMatch(bankTxs: BankTx[], orders: OrderRow[]): Array<{ txId: string; orderId: string }> {
  const matches: Array<{ txId: string; orderId: string }> = []
  const usedOrderIds = new Set<string>()

  for (const tx of bankTxs) {
    if (tx.status !== 'UNMATCHED') continue
    const txDate = new Date(tx.date).getTime()

    for (const order of orders) {
      if (usedOrderIds.has(order.id)) continue
      if (Math.abs(order.total - tx.amount) > 0.01) continue

      const orderDate = new Date(order.date).getTime()
      const diffDays = Math.abs(txDate - orderDate) / (1000 * 60 * 60 * 24)
      if (diffDays <= 1) {
        matches.push({ txId: tx.id, orderId: order.id })
        usedOrderIds.add(order.id)
        break
      }
    }
  }

  return matches
}

// POST /api/bank-transactions/auto-match?storeId=xxx
// Body: { bankAccountId, from?, to? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const body = await req.json() as {
      bankAccountId?: string
      from?: string
      to?: string
    }

    if (!body.bankAccountId?.trim()) return err('bankAccountId required')

    // Fetch unmatched bank transactions
    let txSql = `SELECT id, date, amount, type, status FROM BankTransaction WHERE storeId = ? AND bankAccountId = ? AND status = 'UNMATCHED'`
    const txParams: unknown[] = [storeId, body.bankAccountId.trim()]
    if (body.from) { txSql += ` AND date >= ?`; txParams.push(body.from) }
    if (body.to) { txSql += ` AND date <= ?`; txParams.push(body.to) }

    const bankTxs = await query<BankTx>(txSql, txParams)
    if (bankTxs.length === 0) return ok({ matched: 0, pairs: [] })

    // Fetch orders in date range as candidate matches
    const dates = bankTxs.map(t => t.date).sort()
    const minDate = dates[0]
    const maxDate = dates[dates.length - 1]

    const orders = await query<OrderRow>(
      `SELECT id, createdAt as date, total, 'CREDIT' as type FROM "Order"
       WHERE storeId = ? AND date(createdAt) BETWEEN date(?) AND date(?, '+1 day')
       ORDER BY createdAt ASC`,
      [storeId, minDate, maxDate]
    )

    const pairs = tryAutoMatch(bankTxs, orders)

    for (const { txId, orderId } of pairs) {
      await exec(
        `UPDATE BankTransaction SET status = 'MATCHED', matchedOrderId = ? WHERE id = ?`,
        [orderId, txId]
      )
    }

    return ok({ matched: pairs.length, pairs })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
