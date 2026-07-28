// PATCH /api/pricing-rules/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  if (b.name !== undefined)       { sets.push('name = ?');        vals.push(b.name) }
  if (b.ruleType !== undefined)   { sets.push('ruleType = ?');    vals.push(b.ruleType) }
  if (b.conditions !== undefined) { sets.push('conditions = ?');  vals.push(JSON.stringify(b.conditions)) }
  if (b.adjustment !== undefined) { sets.push('adjustment = ?');  vals.push(b.adjustment) }
  if (b.value !== undefined)      { sets.push('value = ?');       vals.push(b.value) }
  if (b.priority !== undefined)   { sets.push('priority = ?');    vals.push(b.priority) }
  if (b.active !== undefined)     { sets.push('active = ?');      vals.push(b.active ? 1 : 0) }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  sets.push('updatedAt = ?')
  vals.push(nowISO())
  vals.push(id)

  await exec(
    `UPDATE PricingRule SET ${sets.join(', ')} WHERE id = ?`,
    vals,
  )

  return NextResponse.json({ ok: true })
}
