// GET/POST /api/landed-costs/[id]/allocations
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureLandedCostTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/landed-costs/[id]/allocations?storeId=xxx
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id } = await params
    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureLandedCostTables()

    const rows = await query(
      `SELECT a.*, p.name AS productName
       FROM LandedCostAllocation a
       LEFT JOIN Product p ON p.id = a.productId
       WHERE a.landedCostId = ? AND a.storeId = ?
       ORDER BY a.allocatedAmount DESC`,
      [id, storeId],
    )

    return ok((rows as any[]).map(r => ({
      ...r,
      allocatedAmount: Number(r.allocatedAmount),
      newUnitCost: Number(r.newUnitCost),
    })))
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

// POST /api/landed-costs/[id]/allocations?storeId=xxx
// Body: { allocations: [{ productId, poItemId, allocatedAmount, newUnitCost }] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const { id: landedCostId } = await params
    const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureLandedCostTables()

    const b = (await req.json()) as any
    if (!Array.isArray(b.allocations) || b.allocations.length === 0) {
      return err("'allocations' array is required")
    }

    const t = nowISO()
    const ids: string[] = []

    for (const alloc of b.allocations as any[]) {
      if (!alloc.productId) return err('productId required per allocation')
      if (!alloc.poItemId) return err('poItemId required per allocation')
      const allocId = newId()
      ids.push(allocId)
      await exec(
        `INSERT INTO LandedCostAllocation (id, landedCostId, storeId, productId, poItemId, allocatedAmount, newUnitCost, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [allocId, landedCostId, storeId, alloc.productId, alloc.poItemId, Number(alloc.allocatedAmount ?? 0), Number(alloc.newUnitCost ?? 0), t],
      )
    }

    return ok({ inserted: ids.length }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
