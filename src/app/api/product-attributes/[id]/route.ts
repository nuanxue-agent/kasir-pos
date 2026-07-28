import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// PATCH /api/product-attributes/[id]
// Body: { name?, values? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    const body = (await req.json()) as any
    const user = session.user as { stores?: { id: string }[] }

    const rows = await query(`SELECT * FROM ProductAttribute WHERE id = ?`, [id])
    const existing = (rows as any[])[0]
    if (!existing) return err('Not found', 404)

    const hasAccess = user.stores?.some((s: any) => s.id === existing.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const updates: string[] = []
    const vals: any[] = []

    if (body.name !== undefined) {
      updates.push('name = ?')
      vals.push(body.name.trim())
    }
    if (body.values !== undefined) {
      if (!Array.isArray(body.values) || body.values.length === 0)
        return err('values must be a non-empty array')
      updates.push('values = ?')
      vals.push(JSON.stringify(body.values))
    }

    if (updates.length === 0) return err('No fields to update')

    updates.push('updatedAt = ?')
    vals.push(nowISO())
    vals.push(id)

    await exec(
      `UPDATE ProductAttribute SET ${updates.join(', ')} WHERE id = ?`,
      vals,
    )

    return ok({ id, updated: true })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 },
    )
  }
}
