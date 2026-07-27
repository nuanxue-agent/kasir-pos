import { getRequestContext } from '@cloudflare/next-on-pages'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { queryOne, exec, toSQLiteDate } from '@/lib/db'

export const runtime = 'edge'


// PATCH /api/discounts/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body: any = await req.json()

  const { env } = getRequestContext()
  const db = env.DB as D1Database

  const fields: string[] = []
  const values: any[] = []

  const allowed = ['name', 'code', 'type', 'value', 'minOrder', 'maxUses', 'active'] as const
  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`)
      values.push(typeof body[key] === 'boolean' ? (body[key] ? 1 : 0) : body[key])
    }
  }
  if (body.startsAt !== undefined) {
    fields.push('startsAt = ?')
    values.push(body.startsAt ? toSQLiteDate(body.startsAt) : null)
  }
  if (body.endsAt !== undefined) {
    fields.push('endsAt = ?')
    values.push(body.endsAt ? toSQLiteDate(body.endsAt) : null)
  }

  if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  fields.push('updatedAt = ?')
  values.push(toSQLiteDate(new Date()))
  values.push(id)

  await exec(db, `UPDATE Discount SET ${fields.join(', ')} WHERE id = ?`, values)

  const discount = await queryOne(db, `SELECT * FROM Discount WHERE id = ?`, [id])
  if (!discount) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(discount)
}

// DELETE /api/discounts/[id] — soft delete (deactivate)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { env } = getRequestContext()
  const db = env.DB as D1Database

  const result = await exec(db,
    `UPDATE Discount SET active = 0, updatedAt = ? WHERE id = ?`,
    [toSQLiteDate(new Date()), id]
  )

  if (result.meta.changes === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
