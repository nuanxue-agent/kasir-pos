// GET /api/table-layouts?storeId=&floor=
// POST /api/table-layouts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export type TableShape = 'SQUARE' | 'ROUND' | 'BAR'
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING'

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS TableLayout (
      id        TEXT PRIMARY KEY,
      storeId   TEXT NOT NULL,
      tableId   TEXT NOT NULL,
      label     TEXT NOT NULL,
      x         REAL NOT NULL DEFAULT 0,
      y         REAL NOT NULL DEFAULT 0,
      width     REAL NOT NULL DEFAULT 1,
      height    REAL NOT NULL DEFAULT 1,
      shape     TEXT NOT NULL DEFAULT 'SQUARE',
      floor     INTEGER NOT NULL DEFAULT 1,
      capacity  INTEGER NOT NULL DEFAULT 4,
      status    TEXT NOT NULL DEFAULT 'AVAILABLE',
      mergedInto TEXT,
      active    INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const floor = req.nextUrl.searchParams.get('floor')

  let sql = `SELECT * FROM TableLayout WHERE storeId=? AND active=1`
  const params: any[] = [storeId]

  if (floor) {
    sql += ` AND floor=?`
    params.push(Number(floor))
  }

  sql += ` ORDER BY floor ASC, y ASC, x ASC`

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as any

  const required = ['tableId', 'label', 'x', 'y']
  for (const f of required) {
    if (b[f] == null) return err(`Field '${f}' is required`, 400, 'MISSING_FIELD')
  }

  const shape: TableShape = b.shape ?? 'SQUARE'
  if (!['SQUARE', 'ROUND', 'BAR'].includes(shape)) {
    return err(`Invalid shape: ${shape}`, 400, 'INVALID_VALUE')
  }

  const capacity = Number(b.capacity ?? 4)
  if (!Number.isInteger(capacity) || capacity < 1) {
    return err('capacity must be a positive integer', 400, 'INVALID_VALUE')
  }

  const width = Number(b.width ?? 1)
  const height = Number(b.height ?? 1)
  const floor = Number(b.floor ?? 1)

  // Check for position overlap on same floor
  const existing = await query(
    `SELECT id, x, y, width, height FROM TableLayout WHERE storeId=? AND floor=? AND active=1`,
    [storeId, floor],
  )

  for (const t of existing as any[]) {
    if (rectsOverlap(b.x, b.y, width, height, t.x, t.y, t.width, t.height)) {
      return err('Table position overlaps with an existing table', 409, 'OVERLAP')
    }
  }

  const now = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO TableLayout
      (id, storeId, tableId, label, x, y, width, height, shape, floor, capacity, status, active, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
    [id, storeId, b.tableId, b.label, b.x, b.y, width, height, shape, floor, capacity, 'AVAILABLE', now, now],
  )

  const created = await query(`SELECT * FROM TableLayout WHERE id=?`, [id])
  return NextResponse.json((created as any[])[0], { status: 201 })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}
