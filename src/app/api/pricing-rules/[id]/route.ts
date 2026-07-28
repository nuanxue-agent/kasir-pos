// PATCH /api/pricing-rules/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function parseRule(r: any) {
  return {
    ...r,
    active: Boolean(r.active),
    condition: (() => { try { return JSON.parse(r.condition || '{}') } catch { return {} } })(),
    action: (() => { try { return JSON.parse(r.action || '{}') } catch { return {} } })(),
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const { id } = await params
  const body = await req.json() as any

  const existing = await query(`SELECT * FROM PricingRule WHERE id = ?`, [id])
  if (!(existing as any[]).length) return err('Not found', 404)

  // Support soft-delete via { deleted: true }
  if (body.deleted) {
    await exec(`DELETE FROM PricingRule WHERE id = ?`, [id])
    return NextResponse.json({ deleted: true })
  }

  const row = (existing as any[])[0]
  const now = nowISO()

  await exec(
    `UPDATE PricingRule SET
      name      = ?,
      type      = ?,
      condition = ?,
      action    = ?,
      priority  = ?,
      active    = ?,
      validFrom = ?,
      validTo   = ?,
      updatedAt = ?
     WHERE id = ?`,
    [
      body.name      ?? row.name,
      body.type      ?? row.type,
      body.condition !== undefined ? JSON.stringify(body.condition) : row.condition,
      body.action    !== undefined ? JSON.stringify(body.action)    : row.action,
      body.priority  ?? row.priority,
      body.active !== undefined ? (body.active ? 1 : 0) : row.active,
      body.validFrom !== undefined ? body.validFrom : row.validFrom,
      body.validTo   !== undefined ? body.validTo   : row.validTo,
      now,
      id,
    ],
  )

  const updated = await query(`SELECT * FROM PricingRule WHERE id = ?`, [id])
  return NextResponse.json(parseRule((updated as any[])[0]))
}
