// GET /api/pos-sessions/[id]/z-report — end-of-day Z-report for a POS session
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { ensurePOSSessionTables } from '../../route'
import { buildZReport } from '@/lib/pos-session'

function ok(data: unknown) { return NextResponse.json(data) }
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

  await ensurePOSSessionTables()

  const posSession = await queryOne(`SELECT * FROM POSSession WHERE id = ?`, [id]) as any
  if (!posSession) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const movements = await query(
    `SELECT * FROM POSCashMovement WHERE sessionId = ? ORDER BY createdAt ASC`,
    [id],
  ) as any[]

  // Payment breakdown: query order totals grouped by paymentMethod if available
  // Falls back to cash = totalSales when no order data is present
  let paymentBreakdown: { cash: number; card: number; transfer: number; other: number } | undefined
  try {
    const orderRows = await query(
      `SELECT paymentMethod, SUM(total) as total
       FROM "Order"
       WHERE storeId = ? AND createdAt >= ? AND (? IS NULL OR createdAt <= ?)
       GROUP BY paymentMethod`,
      [
        posSession.storeId,
        posSession.openedAt,
        posSession.closedAt ?? null,
        posSession.closedAt ?? null,
      ],
    ) as any[]

    if (orderRows.length > 0) {
      paymentBreakdown = { cash: 0, card: 0, transfer: 0, other: 0 }
      for (const r of orderRows) {
        const method = (r.paymentMethod ?? '').toLowerCase()
        const total = Number(r.total ?? 0)
        if (method === 'cash' || method === 'tunai') paymentBreakdown.cash += total
        else if (method === 'card' || method === 'kartu') paymentBreakdown.card += total
        else if (method === 'transfer' || method === 'bank') paymentBreakdown.transfer += total
        else paymentBreakdown.other += total
      }
    }
  } catch {
    // Order table may not exist yet — proceed with default breakdown
  }

  const report = buildZReport(posSession, movements, paymentBreakdown)
  return ok(report)
}
