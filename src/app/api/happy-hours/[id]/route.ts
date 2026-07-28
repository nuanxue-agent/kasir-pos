import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureTables } from '../route'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function parseRow(r: any) {
  return {
    ...r,
    days: typeof r.days === 'string' ? JSON.parse(r.days) : r.days,
    targetIds: typeof r.targetIds === 'string' ? JSON.parse(r.targetIds) : r.targetIds,
    active: Boolean(r.active),
  }
}

// PATCH /api/happy-hours/[id]
// Body: any subset of { name, days, startTime, endTime, discountType, discountValue, appliesTo, targetIds, active }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params

    await ensureTables()

    const existing = await query('SELECT * FROM HappyHour WHERE id = ?', [id])
    if (!(existing as any[]).length) return err('Happy hour not found', 404)

    const body = (await req.json()) as any
    const updates: string[] = []
    const values: any[] = []

    if (body.name !== undefined) {
      updates.push('name = ?')
      values.push(body.name.trim())
    }
    if (body.days !== undefined) {
      updates.push('days = ?')
      values.push(JSON.stringify(body.days))
    }
    if (body.startTime !== undefined) {
      updates.push('startTime = ?')
      values.push(body.startTime)
    }
    if (body.endTime !== undefined) {
      updates.push('endTime = ?')
      values.push(body.endTime)
    }
    if (body.discountType !== undefined) {
      updates.push('discountType = ?')
      values.push(body.discountType)
    }
    if (body.discountValue !== undefined) {
      updates.push('discountValue = ?')
      values.push(body.discountValue)
    }
    if (body.appliesTo !== undefined) {
      updates.push('appliesTo = ?')
      values.push(body.appliesTo)
    }
    if (body.targetIds !== undefined) {
      updates.push('targetIds = ?')
      values.push(JSON.stringify(body.targetIds))
    }
    if (body.active !== undefined) {
      updates.push('active = ?')
      values.push(body.active ? 1 : 0)
    }

    if (updates.length === 0) return err('Nothing to update')

    updates.push('updatedAt = ?')
    values.push(nowISO())
    values.push(id)

    await exec(`UPDATE HappyHour SET ${updates.join(', ')} WHERE id = ?`, values)

    const rows = await query('SELECT * FROM HappyHour WHERE id = ?', [id])
    return ok(parseRow((rows as any[])[0]))
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
