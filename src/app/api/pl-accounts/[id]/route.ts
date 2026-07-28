// PATCH /api/pl-accounts/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'
import { ensureTables, PLAccount, PLCategory } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

const VALID_CATEGORIES: PLCategory[] = ['REVENUE', 'COGS', 'OPEX', 'OTHER_INCOME', 'OTHER_EXPENSE']

// PATCH /api/pl-accounts/[id]?storeId=xxx
// Body: { name?, category?, parentId?, active? }
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

    await ensureTables()

    const { id } = await params

    const rows = await query<PLAccount>(
      `SELECT * FROM PLAccount WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if ((rows as any[]).length === 0) return err('Account not found', 404)

    const body = await req.json() as any

    if (body.category != null && !VALID_CATEGORIES.includes(body.category)) {
      return err('invalid category')
    }

    const sets: string[] = []
    const vals: unknown[] = []

    if (body.name != null) { sets.push('name = ?'); vals.push(String(body.name).trim()) }
    if (body.category != null) { sets.push('category = ?'); vals.push(body.category) }
    if (body.parentId !== undefined) { sets.push('parentId = ?'); vals.push(body.parentId ?? null) }
    if (body.active != null) { sets.push('active = ?'); vals.push(body.active ? 1 : 0) }

    if (sets.length === 0) return err('No fields to update')

    vals.push(id)
    await exec(`UPDATE PLAccount SET ${sets.join(', ')} WHERE id = ?`, vals)

    const updated = await query<PLAccount>(
      `SELECT * FROM PLAccount WHERE id = ?`, [id]
    )
    return ok((updated as any[])[0])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
