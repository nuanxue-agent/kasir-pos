import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'
import { ensureBenefitsTables } from '../route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureBenefitsTables()
    const { id } = params
    const b = (await req.json()) as any

    const existing = await query(`SELECT * FROM BenefitPlan WHERE id = ?`, [id])
    if (!(existing as any[]).length) return err('Benefit plan not found', 404)

    const VALID_TYPES = ['BPJS_KESEHATAN', 'BPJS_KETENAGAKERJAAN', 'HEALTH', 'MEAL', 'TRANSPORT', 'OTHER']
    const VALID_BASES = ['FIXED', 'PERCENTAGE_SALARY']

    if (b.type && !VALID_TYPES.includes(b.type)) return err(`type must be one of ${VALID_TYPES.join(', ')}`)
    if (b.calculationBase && !VALID_BASES.includes(b.calculationBase)) return err('calculationBase must be FIXED or PERCENTAGE_SALARY')

    const sets: string[] = []
    const vals: any[] = []
    if (b.name !== undefined) { sets.push('name = ?'); vals.push(b.name) }
    if (b.type !== undefined) { sets.push('type = ?'); vals.push(b.type) }
    if (b.employeeContribution !== undefined) { sets.push('employeeContribution = ?'); vals.push(b.employeeContribution) }
    if (b.employerContribution !== undefined) { sets.push('employerContribution = ?'); vals.push(b.employerContribution) }
    if (b.calculationBase !== undefined) { sets.push('calculationBase = ?'); vals.push(b.calculationBase) }
    if (b.active !== undefined) { sets.push('active = ?'); vals.push(b.active ? 1 : 0) }

    if (!sets.length) return err('No fields to update')
    sets.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(id)

    await exec(`UPDATE BenefitPlan SET ${sets.join(', ')} WHERE id = ?`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
