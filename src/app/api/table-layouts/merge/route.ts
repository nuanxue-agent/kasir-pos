// POST /api/table-layouts/merge — merge two tables into one logical unit
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const b = (await req.json()) as any

  const { primaryId, secondaryId } = b
  if (!primaryId || !secondaryId) {
    return err('primaryId and secondaryId are required', 400, 'MISSING_FIELD')
  }
  if (primaryId === secondaryId) {
    return err('Cannot merge a table with itself', 400, 'INVALID_VALUE')
  }

  const primary = await queryOne<any>(
    `SELECT * FROM TableLayout WHERE id=? AND storeId=? AND active=1`,
    [primaryId, storeId],
  )
  if (!primary) return err('Primary table not found', 404, 'NOT_FOUND')

  const secondary = await queryOne<any>(
    `SELECT * FROM TableLayout WHERE id=? AND storeId=? AND active=1`,
    [secondaryId, storeId],
  )
  if (!secondary) return err('Secondary table not found', 404, 'NOT_FOUND')

  // Both tables must be on the same floor
  if (primary.floor !== secondary.floor) {
    return err('Tables must be on the same floor to merge', 400, 'FLOOR_MISMATCH')
  }

  // Neither table should already be merged into something else
  if (primary.mergedInto) {
    return err('Primary table is already part of a merge', 400, 'ALREADY_MERGED')
  }
  if (secondary.mergedInto) {
    return err('Secondary table is already part of a merge', 400, 'ALREADY_MERGED')
  }

  const now = nowISO()
  const mergedCapacity = Number(primary.capacity) + Number(secondary.capacity)

  // Update primary: increase capacity, set status to OCCUPIED
  await exec(
    `UPDATE TableLayout SET capacity=?, status='OCCUPIED', updatedAt=? WHERE id=?`,
    [mergedCapacity, now, primaryId],
  )

  // Mark secondary as merged into primary (keep active=1 so it still shows on the floor plan as merged)
  await exec(
    `UPDATE TableLayout SET mergedInto=?, status='OCCUPIED', updatedAt=? WHERE id=?`,
    [primaryId, now, secondaryId],
  )

  const updatedPrimary = await queryOne<any>(`SELECT * FROM TableLayout WHERE id=?`, [primaryId])
  const updatedSecondary = await queryOne<any>(`SELECT * FROM TableLayout WHERE id=?`, [secondaryId])

  return NextResponse.json({
    primary: updatedPrimary,
    secondary: updatedSecondary,
    mergedCapacity,
  })
}

// POST /api/table-layouts/merge?action=split — undo a merge
// Send body: { primaryId }
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const b = (await req.json()) as any
  const { primaryId } = b
  if (!primaryId) return err('primaryId is required', 400, 'MISSING_FIELD')

  const primary = await queryOne<any>(
    `SELECT * FROM TableLayout WHERE id=? AND storeId=? AND active=1`,
    [primaryId, storeId],
  )
  if (!primary) return err('Primary table not found', 404, 'NOT_FOUND')

  const { query } = await import('@/lib/db')
  // Find all secondaries merged into this primary
  const secondaries = await query(
    `SELECT * FROM TableLayout WHERE mergedInto=? AND storeId=?`,
    [primaryId, storeId],
  )

  const now = nowISO()
  const originalCapacity =
    Number(primary.capacity) -
    (secondaries as any[]).reduce((sum, t) => sum + Number(t.capacity), 0)

  // Restore primary capacity
  await exec(
    `UPDATE TableLayout SET capacity=?, status='AVAILABLE', updatedAt=? WHERE id=?`,
    [Math.max(1, originalCapacity), now, primaryId],
  )

  // Unlink secondaries
  for (const sec of secondaries as any[]) {
    await exec(
      `UPDATE TableLayout SET mergedInto=NULL, status='AVAILABLE', updatedAt=? WHERE id=?`,
      [now, sec.id],
    )
  }

  return NextResponse.json({ split: true, primaryId, secondaryIds: (secondaries as any[]).map(s => s.id) })
}
