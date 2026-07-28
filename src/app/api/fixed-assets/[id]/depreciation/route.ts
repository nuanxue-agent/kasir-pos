// GET/POST /api/fixed-assets/[id]/depreciation
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'
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
  const annualRate = 1 / usefulLifeYears
  return (currentBookValue * annualRate) / 12
}

// GET /api/fixed-assets/[id]/depreciation?storeId=xxx
// Returns the depreciation schedule for an asset
export async function GET(
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

    const asset = await queryOne<{ id: string; storeId: string }>(
      `SELECT id, storeId FROM FixedAsset WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!asset) return err('Asset not found', 404)

    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM AssetDepreciation WHERE assetId = ? AND storeId = ? ORDER BY year ASC, month ASC`,
      [id, storeId]
    )

    return ok(rows)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/fixed-assets/[id]/depreciation?storeId=xxx
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

    const floor = asset.currentBookValue - asset.residualValue
    if (amount > floor) amount = floor

    const bookValueAfter = Math.max(asset.residualValue, asset.currentBookValue - amount)
    const depId = newId()
    const now = nowISO()

    // Calculate accumulated depreciation
    const prevRows = await query<{ amount: number }>(
      `SELECT amount FROM AssetDepreciation WHERE assetId = ? ORDER BY year ASC, month ASC`,
      [id]
    )
    const accumulatedDepreciation = prevRows.reduce((s, r) => s + r.amount, 0) + amount

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

    return ok({
      id: depId,
      assetId: id,
      storeId,
      period: `${body.year}-${String(body.month).padStart(2, '0')}`,
      year: body.year,
      month: body.month,
      amount,
      accumulatedDepreciation,
      bookValue: bookValueAfter,
      recordedAt: now,
    }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
