import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'
import { ensureBenefitsTables } from '../../benefit-plans/route'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureBenefitsTables()
    const { id } = params
    const b = (await req.json()) as any

    const existing = await query(`SELECT * FROM EmployeeBenefit WHERE id = ?`, [id])
    if (!(existing as any[]).length) return err('Employee benefit not found', 404)

    const sets: string[] = []
    const vals: any[] = []
    if (b.active !== undefined) { sets.push('active = ?'); vals.push(b.active ? 1 : 0) }
    if (b.value !== undefined) { sets.push('value = ?'); vals.push(b.value) }
    if (b.enrolledAt !== undefined) { sets.push('enrolledAt = ?'); vals.push(b.enrolledAt) }

    if (!sets.length) return err('No fields to update')
    sets.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(id)

    await exec(`UPDATE EmployeeBenefit SET ${sets.join(', ')} WHERE id = ?`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
