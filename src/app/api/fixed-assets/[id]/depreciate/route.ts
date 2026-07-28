// POST /api/fixed-assets/[id]/depreciate
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, newId, nowISO } from '@/lib/db'
import { ensureTables } from '../../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export function calcMonthlyDepreciation(
  currentBookValue: number,
  purchasePrice: number,
  residualValue: number,
  usefulLifeYears: number,
  method: 'STRAIGHT_LINE' | 'DECLINING_BALANCE'
): number {
  if (method === 'STRAIGHT_LINE') {
    return (purchasePrice - residualValue) / (usefulLifeYears * 12)
  }
  // Declining balance: annual rate = 1 / usefulLifeYears (book value method)
  const annualRate = 1 / usefulLifeYears
  return (currentBookValue * annualRate) / 12
}

// POST /api/fixed-assets/[id]/depreciate?storeId=xxx
// Body: { year, month }
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
      purchasePrice: number
      residualValue: number
      usefulLifeYears: number
      depreciationMethod: string
      currentBookValue: number
      status: string
    }>(
      `SELECT id, storeId, purchasePrice, residualValue, usefulLifeYears, depreciationMethod, currentBookValue, status
       FROM FixedAsset WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!asset) return err('Asset not found', 404)
    if (asset.status === 'DISPOSED') return err('Cannot depreciate a disposed asset')
    if (asset.status === 'FULLY_DEPRECIATED') return err('Asset is already fully depreciated')

    const body = await req.json() as { year?: number; month?: number }
    if (!body.year || body.year < 2000) return err('year required (>= 2000)')
    if (!body.month || body.month < 1 || body.month > 12) return err('month required (1-12)')

    // Check duplicate
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM AssetDepreciation WHERE assetId = ? AND year = ? AND month = ?`,
      [id, body.year, body.month]
    )
    if (existing) return err(`Depreciation for ${body.year}/${body.month} already recorded`)

    const method = asset.depreciationMethod as 'STRAIGHT_LINE' | 'DECLINING_BALANCE'
    let amount = calcMonthlyDepreciation(
      asset.currentBookValue,
      asset.purchasePrice,
      asset.residualValue,
      asset.usefulLifeYears,
      method
    )

    // Don't go below residual value
    const floor = asset.currentBookValue - asset.residualValue
    if (amount > floor) amount = floor

    const bookValueAfter = Math.max(asset.residualValue, asset.currentBookValue - amount)
    const depId = newId()
    const now = nowISO()

    await exec(
      `INSERT INTO AssetDepreciation (id, assetId, storeId, year, month, amount, bookValueAfter, recordedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [depId, id, storeId, body.year, body.month, amount, bookValueAfter, now]
    )

    const newStatus = bookValueAfter <= asset.residualValue + 0.001 ? 'FULLY_DEPRECIATED' : 'ACTIVE'
    await exec(
      `UPDATE FixedAsset SET currentBookValue = ?, status = ? WHERE id = ?`,
      [bookValueAfter, newStatus, id]
    )

    return ok({ id: depId, assetId: id, storeId, year: body.year, month: body.month, amount, bookValueAfter, recordedAt: now }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
