// PATCH /api/accounts/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'
import { ensureTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// PATCH /api/accounts/[id]?storeId=xxx
// Body: { code?, name?, subtype?, description?, active?, parentId? }
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

    const account = await queryOne<{ id: string; storeId: string; isSystem: number }>(
      `SELECT id, storeId, isSystem FROM Account WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!account) return err('Account not found', 404)
    if (account.isSystem) return err('Cannot modify system accounts')

    const body = await req.json() as {
      code?: string
      name?: string
      subtype?: string
      description?: string
      active?: boolean
      parentId?: string | null
    }

    if (body.code && !/^\d{4,6}$/.test(body.code.trim())) {
      return err('code must be 4–6 numeric digits')
    }

    // Check for duplicate code (excluding this account)
    if (body.code) {
      const dup = await queryOne<{ id: string }>(
        `SELECT id FROM Account WHERE storeId = ? AND code = ? AND id != ?`,
        [storeId, body.code.trim(), id]
      )
      if (dup) return err(`Account code ${body.code} already exists`)
    }

    const setClauses: string[] = []
    const setParams: unknown[] = []

    if (body.code?.trim()) { setClauses.push('code = ?'); setParams.push(body.code.trim()) }
    if (body.name?.trim()) { setClauses.push('name = ?'); setParams.push(body.name.trim()) }
    if (body.subtype !== undefined) { setClauses.push('subtype = ?'); setParams.push(body.subtype ?? null) }
    if (body.description !== undefined) { setClauses.push('description = ?'); setParams.push(body.description ?? null) }
    if (body.active !== undefined) { setClauses.push('active = ?'); setParams.push(body.active ? 1 : 0) }
    if ('parentId' in body) { setClauses.push('parentId = ?'); setParams.push(body.parentId ?? null) }

    if (setClauses.length === 0) return err('No fields to update')

    const now = nowISO()
    setClauses.push('updatedAt = ?')
    setParams.push(now)
    setParams.push(id)

    await exec(
      `UPDATE Account SET ${setClauses.join(', ')} WHERE id = ?`,
      setParams
    )

    const updated = await queryOne<Record<string, unknown>>(
      `SELECT * FROM Account WHERE id = ?`,
      [id]
    )
    return ok(updated)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
