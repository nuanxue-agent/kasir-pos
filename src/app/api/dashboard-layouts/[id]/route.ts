// PATCH /api/dashboard-layouts/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { serializeWidgets, deserializeWidgets } from '@/lib/custom-dashboard'
import { ensureDashboardLayoutTable } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

function mapRow(row: any) {
  return {
    ...row,
    isDefault: Boolean(row.isDefault),
    widgets: deserializeWidgets(row.widgets),
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  await ensureDashboardLayoutTable()

  const rows = await query(`SELECT * FROM DashboardLayout WHERE id = ?`, [id]) as any[]
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const layout = rows[0] as any
  const userId = user.id ?? user.email ?? ''
  if (layout.userId !== userId) return err('Forbidden', 403, 'FORBIDDEN')

  const b = (await req.json()) as any
  const sets: string[] = []
  const vals: any[] = []

  if (b.name !== undefined) { sets.push('name = ?'); vals.push(String(b.name).trim()) }
  if (b.widgets !== undefined) {
    sets.push('widgets = ?')
    vals.push(serializeWidgets(Array.isArray(b.widgets) ? b.widgets : []))
  }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  const t = nowISO()
  sets.push('updatedAt = ?'); vals.push(t); vals.push(id)

  await exec(`UPDATE DashboardLayout SET ${sets.join(', ')} WHERE id = ?`, vals)

  const updated = await query(`SELECT * FROM DashboardLayout WHERE id = ?`, [id]) as any[]
  return NextResponse.json(mapRow(updated[0]))
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  await ensureDashboardLayoutTable()

  const rows = await query(`SELECT * FROM DashboardLayout WHERE id = ?`, [id]) as any[]
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const layout = rows[0] as any
  const userId = user.id ?? user.email ?? ''
  if (layout.userId !== userId) return err('Forbidden', 403, 'FORBIDDEN')

  await exec(`DELETE FROM DashboardLayout WHERE id = ?`, [id])
  return NextResponse.json({ ok: true })
}
