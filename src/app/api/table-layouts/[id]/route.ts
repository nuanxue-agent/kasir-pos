// PATCH /api/table-layouts/:id
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, exec, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export type TableShape = 'SQUARE' | 'ROUND' | 'BAR'
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING'

const VALID_STATUS_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  AVAILABLE: ['OCCUPIED', 'RESERVED', 'CLEANING'],
  OCCUPIED: ['AVAILABLE', 'CLEANING'],
  RESERVED: ['AVAILABLE', 'OCCUPIED', 'CLEANING'],
  CLEANING: ['AVAILABLE'],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const { id } = await params

  const existing = await queryOne<any>(
    `SELECT * FROM TableLayout WHERE id=? AND storeId=? AND active=1`,
    [id, storeId],
  )
  if (!existing) return err('Table layout not found', 404, 'NOT_FOUND')

  const b = (await req.json()) as any
  const updates: Record<string, any> = {}

  // Position update — check overlap with other tables
  if (b.x != null || b.y != null) {
    const newX = b.x ?? existing.x
    const newY = b.y ?? existing.y
    const newW = b.width ?? existing.width
    const newH = b.height ?? existing.height

    const { query } = await import('@/lib/db')
    const others = await query(
      `SELECT id, x, y, width, height FROM TableLayout WHERE storeId=? AND floor=? AND active=1 AND id!=?`,
      [storeId, existing.floor, id],
    )
    for (const t of others as any[]) {
      if (rectsOverlap(newX, newY, newW, newH, t.x, t.y, t.width, t.height)) {
        return err('Table position overlaps with an existing table', 409, 'OVERLAP')
      }
    }

    updates.x = newX
    updates.y = newY
    if (b.width != null) updates.width = newW
    if (b.height != null) updates.height = newH
  }

  // Status transition
  if (b.status !== undefined) {
    const from = existing.status as TableStatus
    const to = b.status as TableStatus
    const validStatuses: TableStatus[] = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING']
    if (!validStatuses.includes(to)) {
      return err(`Invalid status: ${to}`, 400, 'INVALID_VALUE')
    }
    if (!VALID_STATUS_TRANSITIONS[from]?.includes(to)) {
      return err(`Invalid status transition: ${from} → ${to}`, 400, 'INVALID_TRANSITION')
    }
    updates.status = to
  }

  // Shape
  if (b.shape !== undefined) {
    if (!['SQUARE', 'ROUND', 'BAR'].includes(b.shape)) {
      return err(`Invalid shape: ${b.shape}`, 400, 'INVALID_VALUE')
    }
    updates.shape = b.shape
  }

  // Capacity
  if (b.capacity !== undefined) {
    const cap = Number(b.capacity)
    if (!Number.isInteger(cap) || cap < 1) {
      return err('capacity must be a positive integer', 400, 'INVALID_VALUE')
    }
    updates.capacity = cap
  }

  // Label
  if (b.label !== undefined) updates.label = String(b.label)

  // Floor
  if (b.floor !== undefined) updates.floor = Number(b.floor)

  // Soft-delete
  if (b.active === false || b.active === 0) updates.active = 0

  if (Object.keys(updates).length === 0) {
    return err('No updatable fields provided', 400, 'NO_FIELDS')
  }

  updates.updatedAt = nowISO()

  const setClauses = Object.keys(updates)
    .map(k => `${k}=?`)
    .join(', ')
  const values = [...Object.values(updates), id]

  await exec(`UPDATE TableLayout SET ${setClauses} WHERE id=?`, values)

  const updated = await queryOne<any>(`SELECT * FROM TableLayout WHERE id=?`, [id])
  return NextResponse.json(updated)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}
