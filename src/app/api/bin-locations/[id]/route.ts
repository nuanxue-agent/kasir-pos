import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureBinLocationTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')

  const { id } = await params
  const body = await req.json() as any

  await ensureBinLocationTables()

  const existing = await query(`SELECT * FROM BinLocation WHERE id = ?`, [id])
  if (!(existing as any[]).length) return err('Bin location not found', 404, 'NOT_FOUND')

  const fields: string[] = []
  const values: any[] = []

  if (body.capacity !== undefined) { fields.push('capacity = ?'); values.push(body.capacity) }
  if (body.active !== undefined)   { fields.push('active = ?');   values.push(body.active ? 1 : 0) }
  if (body.aisle !== undefined)    { fields.push('aisle = ?');    values.push(body.aisle) }
  if (body.rack !== undefined)     { fields.push('rack = ?');     values.push(body.rack) }
  if (body.shelf !== undefined)    { fields.push('shelf = ?');    values.push(body.shelf) }
  if (body.bin !== undefined)      { fields.push('bin = ?');      values.push(body.bin) }

  if (!fields.length) return err('No fields to update', 400, 'MISSING_FIELD')

  values.push(id)
  await exec(`UPDATE BinLocation SET ${fields.join(', ')} WHERE id = ?`, values)

  const updated = await query(`SELECT * FROM BinLocation WHERE id = ?`, [id])
  const row = (updated as any[])[0]
  return NextResponse.json({ ...row, active: Boolean(row.active) })
}
