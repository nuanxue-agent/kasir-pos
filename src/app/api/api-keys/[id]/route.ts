// PATCH /api/api-keys/:id — revoke or update a key
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'
import { ensureApiKeyTables } from '../route'

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
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { id } = await params

  await ensureApiKeyTables()

  const row = (await queryOne(`SELECT id, storeId FROM ApiKey WHERE id = ?`, [id])) as any
  if (!row || !storeIds.includes(row.storeId)) return err('Not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any

  const sets: string[] = []
  const vals: any[] = []

  // revoke shorthand
  if (b.revoke === true || b.active === false) {
    sets.push('active = ?')
    vals.push(0)
  } else if (b.active === true) {
    sets.push('active = ?')
    vals.push(1)
  }

  if (b.name !== undefined) { sets.push('name = ?'); vals.push(b.name) }
  if (b.scopes !== undefined) { sets.push('scopes = ?'); vals.push(JSON.stringify(b.scopes)) }
  if (b.expiresAt !== undefined) { sets.push('expiresAt = ?'); vals.push(b.expiresAt) }

  if (sets.length === 0) return err('No fields to update', 400, 'MISSING_FIELD')

  vals.push(id)
  await exec(`UPDATE ApiKey SET ${sets.join(', ')} WHERE id = ?`, vals)

  return NextResponse.json({ ok: true })
}
