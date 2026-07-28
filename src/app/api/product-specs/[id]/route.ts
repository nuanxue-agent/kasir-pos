import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureSpecTable() {
  await exec(`CREATE TABLE IF NOT EXISTS ProductSpec (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    productId    TEXT NOT NULL,
    specName     TEXT NOT NULL,
    specValue    TEXT NOT NULL DEFAULT '',
    specGroup    TEXT NOT NULL DEFAULT 'General',
    displayOrder INTEGER NOT NULL DEFAULT 0,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
}

// PATCH /api/product-specs/[id]
// Body: { specName?, specValue?, specGroup?, displayOrder? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    const user = session.user as { stores?: { id: string }[] }

    await ensureSpecTable()

    const rows = await query(`SELECT * FROM ProductSpec WHERE id = ?`, [id])
    const spec = (rows as any[])[0]
    if (!spec) return err('Spec not found', 404)

    const hasAccess = user.stores?.some(s => s.id === spec.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const body = (await req.json()) as any
    const t = nowISO()

    const specName = body.specName?.trim() ?? spec.specName
    const specValue = body.specValue ?? spec.specValue
    const specGroup = body.specGroup ?? spec.specGroup
    const displayOrder =
      body.displayOrder !== undefined ? Number(body.displayOrder) : spec.displayOrder

    await exec(
      `UPDATE ProductSpec SET specName=?, specValue=?, specGroup=?, displayOrder=?, updatedAt=? WHERE id=?`,
      [specName, specValue, specGroup, displayOrder, t, id],
    )

    return ok({ id, specName, specValue, specGroup, displayOrder })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// DELETE /api/product-specs/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const { id } = await params
    const user = session.user as { stores?: { id: string }[] }

    await ensureSpecTable()

    const rows = await query(`SELECT storeId FROM ProductSpec WHERE id = ?`, [id])
    const spec = (rows as any[])[0]
    if (!spec) return err('Spec not found', 404)

    const hasAccess = user.stores?.some(s => s.id === spec.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await exec(`DELETE FROM ProductSpec WHERE id = ?`, [id])

    return ok({ deleted: id })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
