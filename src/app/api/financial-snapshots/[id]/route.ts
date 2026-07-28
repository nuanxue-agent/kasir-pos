import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureFinancialSnapshotTable } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params
    if (!id) return err('id required')

    await ensureFinancialSnapshotTable()

    // Verify ownership
    const [existing] = await query(`SELECT * FROM FinancialSnapshot WHERE id = ?`, [id]) as any[]
    if (!existing) return err('Not found', 404)

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === existing.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const b = (await req.json()) as any
    const now = nowISO()

    const fields: string[] = []
    const values: any[] = []

    const updatable = [
      'period', 'totalAssets', 'currentAssets', 'currentLiabilities', 'inventory',
      'revenue', 'grossProfit', 'netProfit', 'equity', 'receivables', 'computedAt',
    ]
    for (const key of updatable) {
      if (b[key] !== undefined) {
        fields.push(`${key} = ?`)
        values.push(b[key])
      }
    }

    if (fields.length === 0) return err('No fields to update')

    fields.push('updatedAt = ?')
    values.push(now)
    values.push(id)

    await exec(
      `UPDATE FinancialSnapshot SET ${fields.join(', ')} WHERE id = ?`,
      values,
    )

    const [updated] = await query(`SELECT * FROM FinancialSnapshot WHERE id = ?`, [id])
    return ok(updated)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
