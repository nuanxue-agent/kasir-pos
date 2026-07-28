import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'
import type { CommissionType } from '@/lib/commissions'

const VALID_TYPES: CommissionType[] = ['FIXED', 'PERCENTAGE', 'TIERED']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json() as any

    const existing = await query('SELECT * FROM CommissionRule WHERE id = ?', [id])
    if (!existing.length) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })

    const updates: string[] = []
    const values: any[] = []

    if (body.type !== undefined) {
      if (!VALID_TYPES.includes(body.type)) {
        return NextResponse.json({ error: `type must be one of ${VALID_TYPES.join(', ')}` }, { status: 400 })
      }
      updates.push('type = ?'); values.push(body.type)
    }
    if (body.value !== undefined) { updates.push('value = ?'); values.push(body.value) }
    if (body.minSales !== undefined) { updates.push('minSales = ?'); values.push(body.minSales) }
    if (body.maxSales !== undefined) { updates.push('maxSales = ?'); values.push(body.maxSales) }
    if (body.employeeId !== undefined) { updates.push('employeeId = ?'); values.push(body.employeeId) }
    if (body.productCategory !== undefined) { updates.push('productCategory = ?'); values.push(body.productCategory) }
    if (body.tiers !== undefined) {
      updates.push('tiers = ?')
      values.push(body.tiers ? JSON.stringify(body.tiers) : null)
    }
    if (body.active !== undefined) { updates.push('active = ?'); values.push(body.active ? 1 : 0) }

    if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

    updates.push('updatedAt = ?'); values.push(nowISO())
    values.push(id)

    await exec(`UPDATE CommissionRule SET ${updates.join(', ')} WHERE id = ?`, values)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
