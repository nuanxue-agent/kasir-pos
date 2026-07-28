// POST /api/landed-costs/[id]/post — post landed cost and update product unit costs
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { ensureLandedCostTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

function allocateByValue(totalCost: number, items: any[]): Map<string, number> {
  const totalValue = items.reduce((s: number, i: any) => s + Number(i.total ?? 0), 0)
  const result = new Map<string, number>()
  if (totalValue === 0) { items.forEach(i => result.set(i.id, 0)); return result }
  for (const item of items) {
    result.set(item.id, Math.round((Number(item.total) / totalValue) * totalCost))
  }
  return result
}

function allocateByQty(totalCost: number, items: any[]): Map<string, number> {
  const totalQty = items.reduce((s: number, i: any) => s + Number(i.qty ?? 0), 0)
  const result = new Map<string, number>()
  if (totalQty === 0) { items.forEach(i => result.set(i.id, 0)); return result }
  for (const item of items) {
    result.set(item.id, Math.round((Number(item.qty) / totalQty) * totalCost))
  }
  return result
}

function allocateByWeight(totalCost: number, items: any[]): Map<string, number> {
  const totalWeight = items.reduce((s: number, i: any) => s + Number(i.weight ?? i.qty ?? 0), 0)
  const result = new Map<string, number>()
  if (totalWeight === 0) { items.forEach(i => result.set(i.id, 0)); return result }
  for (const item of items) {
    result.set(item.id, Math.round((Number(item.weight ?? item.qty) / totalWeight) * totalCost))
  }
  return result
}

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

    // Load the landed cost
    const lcRows = await query(
      `SELECT * FROM LandedCost WHERE id = ? AND storeId = ?`,
      [landedCostId, storeId],
    )
    const lc = (lcRows as any[])[0]
    if (!lc) return err('Landed cost not found', 404)
    if (lc.status === 'POSTED') return err('Already posted')

    // Load PO items with product cost info
    const poItems = await query(
      `SELECT poi.*, p.cost AS currentCost
       FROM POItem poi
       LEFT JOIN Product p ON p.id = poi.productId
       WHERE poi.poId = ? AND poi.storeId = ?`,
      [lc.poId, storeId],
    )
    const items = poItems as any[]
    if (items.length === 0) return err('No PO items found for this purchase order')

    const totalCost = Number(lc.amount)
    const method = lc.allocationMethod as string

    // Compute allocation per PO item
    let allocationMap: Map<string, number>
    if (method === 'BY_VALUE') {
      allocationMap = allocateByValue(totalCost, items)
    } else if (method === 'BY_QTY') {
      allocationMap = allocateByQty(totalCost, items)
    } else {
      allocationMap = allocateByWeight(totalCost, items)
    }

    const t = nowISO()

    // Write allocations + update product costs
    for (const item of items) {
      const allocated = allocationMap.get(item.id) ?? 0
      const qty = Number(item.qty ?? 1)
      const currentCost = Number(item.currentCost ?? item.unitPrice ?? 0)
      const newUnitCost = qty > 0
        ? Math.round((currentCost * qty + allocated) / qty)
        : currentCost

      // Insert allocation record
      await exec(
        `INSERT INTO LandedCostAllocation (id, landedCostId, storeId, productId, poItemId, allocatedAmount, newUnitCost, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId(), landedCostId, storeId, item.productId, item.id, allocated, newUnitCost, t],
      )

      // Update product cost
      if (allocated > 0) {
        await exec(
          `UPDATE Product SET cost = ? WHERE id = ? AND storeId = ?`,
          [newUnitCost, item.productId, storeId],
        )
      }
    }

    // Mark as POSTED
    await exec(
      `UPDATE LandedCost SET status = 'POSTED' WHERE id = ?`,
      [landedCostId],
    )

    return ok({ ok: true, allocations: items.length })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
