// POST /api/fixed-assets/[id]/dispose
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'
import { ensureTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// POST /api/fixed-assets/[id]/dispose?storeId=xxx
// Body: { disposalDate, disposalProceeds? }
export async function POST(
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

    const asset = await queryOne<{
      id: string
      storeId: string
      currentBookValue: number
      status: string
    }>(
      `SELECT id, storeId, currentBookValue, status FROM FixedAsset WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!asset) return err('Asset not found', 404)
    if (asset.status === 'DISPOSED') return err('Asset is already disposed')

    const body = await req.json() as { disposalDate?: string; disposalProceeds?: number }
    if (!body.disposalDate) return err('disposalDate required')

    const disposalProceeds = Number(body.disposalProceeds ?? 0)
    const gainLoss = disposalProceeds - asset.currentBookValue

    await exec(
      `UPDATE FixedAsset SET status = 'DISPOSED', disposalDate = ?, disposalProceeds = ?, currentBookValue = 0 WHERE id = ?`,
      [body.disposalDate, disposalProceeds, id]
    )

    return ok({
      id,
      storeId,
      status: 'DISPOSED',
      disposalDate: body.disposalDate,
      disposalProceeds,
      bookValueAtDisposal: asset.currentBookValue,
      gainLoss,
      updatedAt: nowISO(),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
