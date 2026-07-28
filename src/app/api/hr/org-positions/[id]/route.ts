import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureOrgPositionTable } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id } = await params

  await ensureOrgPositionTable()

  const existing = await query(
    `SELECT id FROM OrgPosition WHERE id = ? AND storeId = ?`,
    [id, storeId],
  )
  if ((existing as any[]).length === 0) return err('Position not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const t = nowISO()

  const fields: string[] = []
  const values: any[] = []

  if (b.title !== undefined)      { fields.push('title = ?');      values.push(b.title) }
  if (b.department !== undefined) { fields.push('department = ?'); values.push(b.department) }
  if (b.employeeId !== undefined) { fields.push('employeeId = ?'); values.push(b.employeeId ?? null) }
  if (b.managerId !== undefined)  { fields.push('managerId = ?');  values.push(b.managerId ?? null) }
  if (b.level !== undefined)      { fields.push('level = ?');      values.push(Number(b.level)) }
  if (b.active !== undefined)     { fields.push('active = ?');     values.push(b.active ? 1 : 0) }

  if (fields.length === 0) return err('No fields to update', 400, 'NO_FIELDS')

  fields.push('updatedAt = ?')
  values.push(t)
  values.push(id)

  await exec(
    `UPDATE OrgPosition SET ${fields.join(', ')} WHERE id = ?`,
    values,
  )

  return NextResponse.json({ id })
}
