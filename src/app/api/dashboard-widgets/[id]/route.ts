// PATCH /api/dashboard-widgets/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id } = await params
  const userId = user.id ?? user.sub ?? ''

  const existing = await queryOne(
    `SELECT * FROM DashboardWidget WHERE id=? AND storeId=? AND userId=?`,
    [id, storeId, userId],
  )
  if (!existing) return err('Widget not found', 404, 'NOT_FOUND')

  const body = (await req.json()) as any
  const updates: Record<string, any> = { updatedAt: nowISO() }

  if (body.widgetType !== undefined) updates.widgetType = body.widgetType
  if (body.position !== undefined) updates.position = JSON.stringify(body.position)
  if (body.config !== undefined) updates.config = JSON.stringify(body.config)
  if (body.active !== undefined) updates.active = body.active ? 1 : 0

  const setClauses = Object.keys(updates)
    .map(k => `${k} = ?`)
    .join(', ')
  const values = Object.values(updates)

  await exec(`UPDATE DashboardWidget SET ${setClauses} WHERE id=? AND storeId=?`, [
    ...values,
    id,
    storeId,
  ])

  const row = await queryOne(`SELECT * FROM DashboardWidget WHERE id=?`, [id])
  return NextResponse.json({
    ...(row as any),
    active: Boolean((row as any).active),
    position: JSON.parse((row as any).position),
    config: JSON.parse((row as any).config),
  })
}
