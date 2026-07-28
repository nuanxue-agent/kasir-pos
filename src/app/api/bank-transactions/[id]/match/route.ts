// POST /api/bank-transactions/[id]/match
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// POST /api/bank-transactions/[id]/match?storeId=xxx
// Body: { matchedOrderId?, matchedJournalId? } — provide at least one
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const { id } = await params
    const tx = await queryOne<{ id: string; storeId: string; status: string }>(
      `SELECT id, storeId, status FROM BankTransaction WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!tx) return err('Transaction not found', 404)
    if (tx.status === 'MATCHED') return err('Transaction already matched')

    const body = await req.json() as {
      matchedOrderId?: string | null
      matchedJournalId?: string | null
    }

    if (!body.matchedOrderId && !body.matchedJournalId) {
      return err('matchedOrderId or matchedJournalId required')
    }

    await exec(
      `UPDATE BankTransaction SET status = 'MANUAL', matchedOrderId = ?, matchedJournalId = ? WHERE id = ?`,
      [body.matchedOrderId ?? null, body.matchedJournalId ?? null, id]
    )

    const updated = await queryOne<Record<string, unknown>>(
      `SELECT * FROM BankTransaction WHERE id = ?`,
      [id]
    )
    return ok(updated)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
