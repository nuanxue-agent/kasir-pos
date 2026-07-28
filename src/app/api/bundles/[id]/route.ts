import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function requireAccess(bundleId: string): Promise<{ bundle: any; storeId: string } | NextResponse> {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as { stores?: { id: string }[] }

  const bundle = await queryOne<any>(`SELECT * FROM ProductBundle WHERE id = ?`, [bundleId])
  if (!bundle) return err('Bundle not found', 404)

  const hasAccess = user.stores?.some(s => s.id === bundle.storeId) ?? false
  if (!hasAccess) return err('Forbidden', 403)

  return { bundle, storeId: bundle.storeId }
}

// PATCH /api/bundles/:id
// Body: { name?, description?, price?, active?, items?: [{productId, qty}][] }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const result = await requireAccess(id)
    if (result instanceof NextResponse) return result

    const body = (await req.json()) as any
    const allowed = ['name', 'description', 'price', 'active'] as const
    const cols: Record<string, any> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) cols[key] = body[key]
    }

    const t = nowISO()
    if (Object.keys(cols).length > 0) {
      const setClauses = Object.keys(cols).map(k => `${k} = ?`).join(', ')
      const values = Object.values(cols)
      await exec(`UPDATE ProductBundle SET ${setClauses}, updatedAt = ? WHERE id = ?`, [
        ...values, t, id,
      ])
    }

    // Replace items if provided
    if (Array.isArray(body.items)) {
      await exec(`DELETE FROM BundleItem WHERE bundleId = ?`, [id])
      for (const item of body.items as Array<{ productId: string; qty: number }>) {
        await exec(`INSERT INTO BundleItem (id,bundleId,productId,qty) VALUES (?,?,?,?)`, [
          newId(), id, item.productId, Number(item.qty) || 1,
        ])
      }
    }

    return ok({ ok: true })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// DELETE /api/bundles/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const result = await requireAccess(id)
    if (result instanceof NextResponse) return result

    await exec(`DELETE FROM BundleItem WHERE bundleId = ?`, [id])
    await exec(`DELETE FROM ProductBundle WHERE id = ?`, [id])

    return ok({ ok: true })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
