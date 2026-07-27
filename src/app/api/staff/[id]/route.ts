import { getRequestContext } from '@cloudflare/next-on-pages'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { queryOne, exec, toSQLiteDate } from '@/lib/db'
import * as bcrypt from 'bcryptjs'

export const runtime = 'edge'


// PATCH /api/staff/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body: any = await req.json()

  const { env } = getRequestContext()
  const db = env.DB as D1Database

  const fields: string[] = []
  const values: any[] = []

  if (body.name)              { fields.push('name = ?');     values.push(body.name) }
  if (body.role)              { fields.push('role = ?');     values.push(body.role) }
  if (body.active !== undefined) { fields.push('active = ?'); values.push(body.active ? 1 : 0) }
  if (body.password)          { fields.push('password = ?'); values.push(await bcrypt.hash(body.password, 12)) }
  if (body.pin)               { fields.push('pin = ?');      values.push(await bcrypt.hash(body.pin, 10)) }

  if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  fields.push('updatedAt = ?')
  values.push(toSQLiteDate(new Date()))
  values.push(id)

  await exec(db, `UPDATE User SET ${fields.join(', ')} WHERE id = ?`, values)

  // Update store role if provided
  if (body.role && body.storeId) {
    await exec(db,
      `UPDATE StoreUser SET role = ?, updatedAt = ? WHERE userId = ? AND storeId = ?`,
      [body.role, toSQLiteDate(new Date()), id, body.storeId]
    )
  }

  const user = await queryOne<{
    id: string; name: string; email: string; role: string; active: number
  }>(db, `SELECT id, name, email, role, active FROM User WHERE id = ?`, [id])

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(user)
}

// DELETE /api/staff/[id] — deactivate
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { env } = getRequestContext()
  const db = env.DB as D1Database

  const result = await exec(db,
    `UPDATE User SET active = 0, updatedAt = ? WHERE id = ?`,
    [toSQLiteDate(new Date()), id]
  )

  if (result.meta.changes === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
