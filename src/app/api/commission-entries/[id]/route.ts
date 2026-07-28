import { NextRequest, NextResponse } from 'next/server'
import { query, exec, nowISO } from '@/lib/db'
import { isValidStatusTransition } from '@/lib/commissions'
import type { CommissionStatus } from '@/lib/commissions'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json() as any
    const { action } = body

    const rows = await query('SELECT * FROM CommissionEntry WHERE id = ?', [id])
    if (!rows.length) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    const entry = rows[0] as any

    const now = nowISO()

    if (action === 'approve') {
      if (!isValidStatusTransition(entry.status as CommissionStatus, 'APPROVED')) {
        return NextResponse.json(
          { error: `Cannot approve entry with status ${entry.status}` },
          { status: 400 },
        )
      }
      await exec(
        'UPDATE CommissionEntry SET status = ?, updatedAt = ? WHERE id = ?',
        ['APPROVED', now, id],
      )
      return NextResponse.json({ ok: true, status: 'APPROVED' })
    }

    if (action === 'pay') {
      if (!isValidStatusTransition(entry.status as CommissionStatus, 'PAID')) {
        return NextResponse.json(
          { error: `Cannot pay entry with status ${entry.status}` },
          { status: 400 },
        )
      }
      await exec(
        'UPDATE CommissionEntry SET status = ?, paidAt = ?, updatedAt = ? WHERE id = ?',
        ['PAID', now, now, id],
      )
      return NextResponse.json({ ok: true, status: 'PAID' })
    }

    // Generic field update
    const updates: string[] = []
    const values: any[] = []

    if (body.commissionAmount !== undefined) { updates.push('commissionAmount = ?'); values.push(body.commissionAmount) }
    if (body.status !== undefined) {
      const validStatuses: CommissionStatus[] = ['PENDING', 'APPROVED', 'PAID']
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      updates.push('status = ?'); values.push(body.status)
    }

    if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

    updates.push('updatedAt = ?'); values.push(now)
    values.push(id)

    await exec(`UPDATE CommissionEntry SET ${updates.join(', ')} WHERE id = ?`, values)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
