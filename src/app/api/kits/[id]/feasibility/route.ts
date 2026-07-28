// GET /api/kits/[id]/feasibility?qty=N&storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { checkFeasibility } from '@/lib/kitting'
import type { ComponentWithStock } from '@/lib/kitting'
import { ensureKitTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: kitId } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const qtyParam = req.nextUrl.searchParams.get('qty')
  const targetQty = qtyParam ? Number(qtyParam) : 1
  if (isNaN(targetQty) || targetQty <= 0) return err("'qty' must be a positive number", 400, 'INVALID_FIELD')

  await ensureKitTables()

  // Verify kit exists
  const kitRows = await query(`SELECT * FROM Kit WHERE id = ? AND storeId = ?`, [kitId, storeId])
  if ((kitRows as any[]).length === 0) return err('Kit not found', 404, 'NOT_FOUND')

  // Fetch components with current stock
  const compRows = await query(
    `SELECT kc.*, p.stock AS currentStock, p.cost AS costPerUnit, p.name AS componentProductName
     FROM KitComponent kc
     LEFT JOIN Product p ON p.id = kc.componentProductId
     WHERE kc.kitId = ?`,
    [kitId],
  )

  const components = (compRows as any[]).map(r => ({
    id: r.id,
    kitId: r.kitId,
    storeId: r.storeId,
    componentProductId: r.componentProductId,
    requiredQty: Number(r.requiredQty),
    currentStock: Number(r.currentStock ?? 0),
    costPerUnit: Number(r.costPerUnit ?? 0),
    componentProductName: r.componentProductName,
  })) as ComponentWithStock[]

  const result = checkFeasibility(components, targetQty)

  return NextResponse.json({
    ...result,
    kitId,
    storeId,
  })
}
