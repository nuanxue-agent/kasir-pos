import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// PATCH /api/flash-sales/[id]
// Body: { name?, startAt?, endAt?, status? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    const body = (await req.json()) as any
    const user = session.user as any

    const rows = await query(`SELECT * FROM FlashSale WHERE id = ?`, [id])
    if (!rows.length) return err('Not found', 404)
    const sale = rows[0] as any

    const hasAccess = user.stores?.some((s: any) => s.id === sale.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const allowedStatuses = ['SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED']
    if (body.status && !allowedStatuses.includes(body.status)) {
      return err(`status must be one of: ${allowedStatuses.join(', ')}`)
    }

    const name     = body.name     ?? sale.name
    const startAt  = body.startAt  ?? sale.startAt
    const endAt    = body.endAt    ?? sale.endAt
    const status   = body.status   ?? sale.status
    const updatedAt = nowISO()

    if (body.startAt || body.endAt) {
      const start = new Date(startAt).getTime()
      const end   = new Date(endAt).getTime()
      if (end <= start) return err('endAt must be after startAt')
    }

    await exec(
      `UPDATE FlashSale SET name = ?, startAt = ?, endAt = ?, status = ?, updatedAt = ? WHERE id = ?`,
      [name, startAt, endAt, status, updatedAt, id],
    )

    return ok({ id, name, startAt, endAt, status, updatedAt })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
