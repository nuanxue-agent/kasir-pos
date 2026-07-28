// POST /api/dashboard-layouts/[id]/default — set a layout as the default
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureDashboardLayoutTable } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(
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

  const t = nowISO()

  // Clear current default for this user+store
  await exec(
    `UPDATE DashboardLayout SET isDefault = 0, updatedAt = ? WHERE storeId = ? AND userId = ? AND isDefault = 1`,
    [t, layout.storeId, userId],
  )

  // Set the new default
  await exec(
    `UPDATE DashboardLayout SET isDefault = 1, updatedAt = ? WHERE id = ?`,
    [t, id],
  )

  return NextResponse.json({ ok: true, defaultLayoutId: id })
}
