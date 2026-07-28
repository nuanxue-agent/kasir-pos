// PATCH /api/fixed-assets/[id]
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec } from '@/lib/db'
import { ensureTables } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// PATCH /api/fixed-assets/[id]?storeId=xxx
// Body: { name?, category?, usefulLifeYears?, residualValue?, depreciationMethod? }
export async function PATCH(
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

    const asset = await queryOne<{ id: string; storeId: string; status: string }>(
      `SELECT id, storeId, status FROM FixedAsset WHERE id = ? AND storeId = ?`,
      [id, storeId]
    )
    if (!asset) return err('Asset not found', 404)
    if (asset.status === 'DISPOSED') return err('Cannot update a disposed asset')

    const body = await req.json() as {
      name?: string
      category?: string
      usefulLifeYears?: number
      residualValue?: number
      depreciationMethod?: string
    }

    const VALID_CATEGORIES = ['EQUIPMENT', 'FURNITURE', 'VEHICLE', 'BUILDING', 'OTHER']
    const VALID_METHODS = ['STRAIGHT_LINE', 'DECLINING_BALANCE']

    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      return err(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`)
    }
    if (body.depreciationMethod && !VALID_METHODS.includes(body.depreciationMethod)) {
      return err(`Invalid depreciationMethod. Must be one of: ${VALID_METHODS.join(', ')}`)
    }

    const setClauses: string[] = []
    const setParams: unknown[] = []

    if (body.name?.trim()) { setClauses.push('name = ?'); setParams.push(body.name.trim()) }
    if (body.category) { setClauses.push('category = ?'); setParams.push(body.category) }
    if (body.usefulLifeYears != null) { setClauses.push('usefulLifeYears = ?'); setParams.push(Number(body.usefulLifeYears)) }
    if (body.residualValue != null) { setClauses.push('residualValue = ?'); setParams.push(Number(body.residualValue)) }
    if (body.depreciationMethod) { setClauses.push('depreciationMethod = ?'); setParams.push(body.depreciationMethod) }

    if (setClauses.length === 0) return err('No fields to update')

    setParams.push(id)
    await exec(
      `UPDATE FixedAsset SET ${setClauses.join(', ')} WHERE id = ?`,
      setParams
    )

    const updated = await queryOne<Record<string, unknown>>(
      `SELECT * FROM FixedAsset WHERE id = ?`,
      [id]
    )
    return ok(updated)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
