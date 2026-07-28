// PATCH /DELETE /api/bundles/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, newId, nowISO } from '@/lib/db'
import { ensureBundleTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

async function requireAccess(bundleId: string): Promise<{ bundle: any; storeId: string } | NextResponse> {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  await ensureBundleTables()

  const bundle = await queryOne<any>(`SELECT * FROM ProductBundle WHERE id = ?`, [bundleId])
  if (!bundle) return err('Bundle not found', 404)

  const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === bundle.storeId) ?? false
  if (!hasAccess) return err('Forbidden', 403)

  return { bundle, storeId: bundle.storeId }
}

// PATCH /api/bundles/[id]
// Body: { name?, description?, bundlePrice?, discountType?, discountValue?,
//         active?, validFrom?, validTo?, items?: [{productId, qty, unitPrice?}][] }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const result = await requireAccess(id)
    if (result instanceof NextResponse) return result

    const body = (await req.json()) as any
    const allowed = ['name', 'description', 'bundlePrice', 'discountType', 'discountValue',
                     'active', 'validFrom', 'validTo'] as const
    const cols: Record<string, any> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (key === 'active') cols[key] = body[key] ? 1 : 0
        else cols[key] = body[key]
      }
    }

    const t = nowISO()
    if (Object.keys(cols).length > 0) {
      const setClauses = Object.keys(cols).map(k => `${k} = ?`).join(', ')
      const values = Object.values(cols)
      await exec(
        `UPDATE ProductBundle SET ${setClauses}, updatedAt = ? WHERE id = ?`,
        [...values, t, id],
      )
    }

    // Replace items if provided
    if (Array.isArray(body.items)) {
      const { storeId } = result
      await exec(`DELETE FROM BundleItem WHERE bundleId = ?`, [id])
      for (const item of body.items as Array<{ productId: string; qty: number; unitPrice?: number }>) {
        await exec(
          `INSERT INTO BundleItem (id, bundleId, storeId, productId, qty, unitPrice, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [newId(), id, storeId, item.productId, Number(item.qty) || 1, Number(item.unitPrice ?? 0), t],
        )
      }
    }

    return ok({ ok: true })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// DELETE /api/bundles/[id]
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
