// GET/POST /api/waste-entries
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type WasteReason = 'EXPIRED' | 'SPOILED' | 'DAMAGED' | 'OVERPRODUCTION' | 'OTHER'
export type WasteShift = 'MORNING' | 'AFTERNOON' | 'EVENING'

export async function ensureWasteTable() {
  await exec(`CREATE TABLE IF NOT EXISTS WasteEntry (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    productName TEXT NOT NULL DEFAULT '',
    qty         REAL NOT NULL DEFAULT 0,
    unit        TEXT NOT NULL DEFAULT 'pcs',
    reason      TEXT NOT NULL DEFAULT 'OTHER',
    cost        REAL NOT NULL DEFAULT 0,
    recordedBy  TEXT NOT NULL,
    recordedAt  TEXT NOT NULL,
    shift       TEXT NOT NULL DEFAULT 'MORNING',
    notes       TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

export const VALID_REASONS: WasteReason[] = ['EXPIRED', 'SPOILED', 'DAMAGED', 'OVERPRODUCTION', 'OTHER']
export const VALID_SHIFTS: WasteShift[] = ['MORNING', 'AFTERNOON', 'EVENING']

// GET /api/waste-entries?storeId=&reason=&shift=&from=&to=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureWasteTable()

    const reason = url.searchParams.get('reason')
    const shift = url.searchParams.get('shift')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let sql = `SELECT * FROM WasteEntry WHERE storeId = ?`
    const params: unknown[] = [storeId]

    if (reason) { sql += ` AND reason = ?`; params.push(reason) }
    if (shift) { sql += ` AND shift = ?`; params.push(shift) }
    if (from) { sql += ` AND recordedAt >= ?`; params.push(from) }
    if (to) { sql += ` AND recordedAt <= ?`; params.push(to) }
    sql += ` ORDER BY recordedAt DESC LIMIT 500`

    const entries = await query(sql, params) as any[]
    return ok(entries)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/waste-entries?storeId=
// Body: { productId, productName?, qty, unit?, reason, cost, recordedBy, shift?, notes? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureWasteTable()

    const b = (await req.json()) as any
    if (!b.productId) return err("Field 'productId' is required")
    if (!b.recordedBy) return err("Field 'recordedBy' is required")

    const qty = Number(b.qty ?? 0)
    if (qty <= 0) return err('qty must be > 0')

    const cost = Number(b.cost ?? 0)
    if (cost < 0) return err('cost must be >= 0')

    const reason: WasteReason = b.reason ?? 'OTHER'
    if (!VALID_REASONS.includes(reason)) return err(`reason must be one of: ${VALID_REASONS.join(', ')}`)

    const shift: WasteShift = b.shift ?? 'MORNING'
    if (!VALID_SHIFTS.includes(shift)) return err(`shift must be one of: ${VALID_SHIFTS.join(', ')}`)

    const t = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO WasteEntry (id, storeId, productId, productName, qty, unit, reason, cost, recordedBy, recordedAt, shift, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, b.productId, b.productName ?? '', qty, b.unit ?? 'pcs', reason, cost, b.recordedBy, t, shift, b.notes ?? null, t, t]
    )

    return ok({ id }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
