// PATCH /api/bs-accounts/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'
import { ensureTables, BSAccount, BSCategory } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

const VALID_CATEGORIES: BSCategory[] = [
  'CURRENT_ASSET',
  'FIXED_ASSET',
  'CURRENT_LIABILITY',
  'LONG_TERM_LIABILITY',
  'EQUITY',
]

// PATCH /api/bs-accounts/[id]?storeId=xxx
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const { id } = await params

    await ensureTables()

    const existing = await query<BSAccount>(
      `SELECT * FROM BSAccount WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!existing[0]) return err('Account not found', 404)

    const body = await req.json() as any
    const { code, name, category, parentId, active } = body

    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      return err(`category must be one of: ${VALID_CATEGORIES.join(', ')}`)
    }

    const updates: string[] = []
    const vals: unknown[] = []

    if (code !== undefined) { updates.push('code = ?'); vals.push(code.trim()) }
    if (name !== undefined) { updates.push('name = ?'); vals.push(name.trim()) }
    if (category !== undefined) { updates.push('category = ?'); vals.push(category) }
    if (parentId !== undefined) { updates.push('parentId = ?'); vals.push(parentId) }
    if (active !== undefined) { updates.push('active = ?'); vals.push(active ? 1 : 0) }

    if (updates.length === 0) return err('No fields to update')

    vals.push(id, storeId)
    await exec(
      `UPDATE BSAccount SET ${updates.join(', ')} WHERE id = ? AND storeId = ?`,
      vals
    )

    const updated = await query<BSAccount>(
      `SELECT * FROM BSAccount WHERE id = ?`,
      [id]
    )
    return ok(updated[0])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    if (msg.includes('UNIQUE')) return err('Kode akun sudah digunakan', 409)
    return err(msg, 500)
  }
}
