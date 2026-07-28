import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureIntercompanyTable } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    await ensureIntercompanyTable()

    const { id } = params
    const rows = await query(
      `SELECT * FROM IntercompanyTransaction WHERE id = ?`,
      [id],
    ) as any[]
    if (!rows.length) return err('Transaction not found', 404)

    const tx = rows[0]

    const hasAccess =
      user.stores?.some((s: { id: string }) => s.id === tx.fromStoreId || s.id === tx.toStoreId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const body = await req.json() as any
    const { action } = body // 'confirm' | 'settle'

    if (!['confirm', 'settle'].includes(action)) return err("action must be 'confirm' or 'settle'")

    if (action === 'confirm') {
      if (tx.status !== 'PENDING') return err('Only PENDING transactions can be confirmed')
      await exec(
        `UPDATE IntercompanyTransaction SET status = 'CONFIRMED', updatedAt = ? WHERE id = ?`,
        [nowISO(), id],
      )
    } else {
      if (tx.status !== 'CONFIRMED') return err('Only CONFIRMED transactions can be settled')
      const now = nowISO()
      await exec(
        `UPDATE IntercompanyTransaction SET status = 'SETTLED', settledAt = ?, updatedAt = ? WHERE id = ?`,
        [now, now, id],
      )
    }

    const updated = await query(`SELECT * FROM IntercompanyTransaction WHERE id = ?`, [id]) as any[]
    return ok(updated[0])
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
