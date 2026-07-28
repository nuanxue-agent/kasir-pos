// PATCH /api/bank-statements/[id]
// Body: { reconciled?: boolean, matchedTransactionId?: string | null }
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureBankAccountTables } from '../../bank-accounts/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    await ensureBankAccountTables()

    const b = (await req.json()) as any

    const sets: string[] = []
    const vals: any[] = []

    // reconcile
    if (b.reconciled !== undefined) {
      sets.push('reconciled = ?')
      vals.push(b.reconciled ? 1 : 0)
    }

    // match or unmatch
    if ('matchedTransactionId' in b) {
      sets.push('matchedTransactionId = ?')
      vals.push(b.matchedTransactionId ?? null)
    }

    if (sets.length === 0) return err('No fields to update')

    vals.push(id)
    await exec(`UPDATE BankStatement SET ${sets.join(', ')} WHERE id = ?`, vals)
    return ok({ ok: true })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
