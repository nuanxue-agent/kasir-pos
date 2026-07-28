// PATCH /api/cash-flow-forecast/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'
import { ensureTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    const b = (await req.json()) as any

    await ensureTables()

    const sets: string[] = []
    const vals: any[] = []

    if (b.projectedInflow !== undefined) {
      sets.push('projectedInflow = ?')
      vals.push(Number(b.projectedInflow))
    }
    if (b.projectedOutflow !== undefined) {
      sets.push('projectedOutflow = ?')
      vals.push(Number(b.projectedOutflow))
    }
    if (b.projectedBalance !== undefined) {
      sets.push('projectedBalance = ?')
      vals.push(Number(b.projectedBalance))
    }
    if (b.actualInflow !== undefined) {
      sets.push('actualInflow = ?')
      vals.push(Number(b.actualInflow))
    }
    if (b.actualOutflow !== undefined) {
      sets.push('actualOutflow = ?')
      vals.push(Number(b.actualOutflow))
    }
    if (b.actualBalance !== undefined) {
      sets.push('actualBalance = ?')
      vals.push(Number(b.actualBalance))
    }
    if (b.notes !== undefined) {
      sets.push('notes = ?')
      vals.push(String(b.notes))
    }

    if (sets.length === 0) return err('No fields to update')

    sets.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(id)

    await exec(`UPDATE CashFlowForecast SET ${sets.join(', ')} WHERE id = ?`, vals)

    return ok({ ok: true })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
