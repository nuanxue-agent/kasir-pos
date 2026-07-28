// PATCH /api/landed-costs/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec } from '@/lib/db'
import { ensureLandedCostTables } from '../route'

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
    await ensureLandedCostTables()

    const b = (await req.json()) as any

    const sets: string[] = []
    const vals: any[] = []

    const validTypes = ['FREIGHT', 'DUTY', 'INSURANCE', 'OTHER']
    if (b.type !== undefined) {
      if (!validTypes.includes(b.type)) return err(`'type' must be one of ${validTypes.join(', ')}`)
      sets.push('type = ?'); vals.push(b.type)
    }

    if (b.amount !== undefined) {
      const amount = Number(b.amount)
      if (isNaN(amount) || amount <= 0) return err("'amount' must be a positive number")
      sets.push('amount = ?'); vals.push(amount)
    }

    const validMethods = ['BY_VALUE', 'BY_QTY', 'BY_WEIGHT']
    if (b.allocationMethod !== undefined) {
      if (!validMethods.includes(b.allocationMethod)) return err(`'allocationMethod' must be one of ${validMethods.join(', ')}`)
      sets.push('allocationMethod = ?'); vals.push(b.allocationMethod)
    }

    if (b.currency !== undefined) { sets.push('currency = ?'); vals.push(b.currency) }

    if (sets.length === 0) return err('No fields to update')

    vals.push(id)
    await exec(`UPDATE LandedCost SET ${sets.join(', ')} WHERE id = ? AND status = 'DRAFT'`, vals)
    return ok({ ok: true })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
