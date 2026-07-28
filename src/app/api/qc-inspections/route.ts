// GET/POST /api/qc-inspections
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type QCStatus = 'PENDING' | 'PASSED' | 'FAILED' | 'PARTIAL'
export type ReferenceType = 'PURCHASE_ORDER' | 'PRODUCTION' | 'RETURN'

export async function ensureQCTables() {
  await exec(`CREATE TABLE IF NOT EXISTS QCInspection (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    productId     TEXT NOT NULL,
    referenceId   TEXT,
    referenceType TEXT NOT NULL DEFAULT 'PURCHASE_ORDER',
    inspectedBy   TEXT NOT NULL,
    inspectedAt   TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    passQty       REAL NOT NULL DEFAULT 0,
    failQty       REAL NOT NULL DEFAULT 0,
    notes         TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS QCCheckpoint (
    id           TEXT PRIMARY KEY,
    inspectionId TEXT NOT NULL,
    storeId      TEXT NOT NULL,
    criterion    TEXT NOT NULL,
    result       TEXT NOT NULL DEFAULT 'NA',
    value        TEXT,
    threshold    TEXT,
    notes        TEXT,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
}

// GET /api/qc-inspections?storeId=&status=&referenceId=&referenceType=&productId=
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

    await ensureQCTables()

    const status = url.searchParams.get('status')
    const referenceId = url.searchParams.get('referenceId')
    const referenceType = url.searchParams.get('referenceType')
    const productId = url.searchParams.get('productId')

    let sql = `SELECT * FROM QCInspection WHERE storeId = ?`
    const params: unknown[] = [storeId]

    if (status) { sql += ` AND status = ?`; params.push(status) }
    if (referenceId) { sql += ` AND referenceId = ?`; params.push(referenceId) }
    if (referenceType) { sql += ` AND referenceType = ?`; params.push(referenceType) }
    if (productId) { sql += ` AND productId = ?`; params.push(productId) }
    sql += ` ORDER BY createdAt DESC`

    const inspections = await query(sql, params) as any[]

    const enriched = await Promise.all(
      inspections.map(async (insp) => {
        const cps = await query(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN result='PASS' THEN 1 ELSE 0 END) as passed,
                  SUM(CASE WHEN result='FAIL' THEN 1 ELSE 0 END) as failed
           FROM QCCheckpoint WHERE inspectionId = ?`,
          [insp.id]
        ) as any[]
        const c = cps[0] ?? {}
        return {
          ...insp,
          checkpointTotal: c.total ?? 0,
          checkpointPassed: c.passed ?? 0,
          checkpointFailed: c.failed ?? 0,
        }
      })
    )

    return ok(enriched)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/qc-inspections?storeId=
// Body: { productId, referenceId?, referenceType, inspectedBy, notes?, passQty?, failQty?, checkpoints? }
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

    await ensureQCTables()

    const b = (await req.json()) as any
    if (!b.productId) return err("Field 'productId' is required")
    if (!b.inspectedBy) return err("Field 'inspectedBy' is required")

    const VALID_REF_TYPES: ReferenceType[] = ['PURCHASE_ORDER', 'PRODUCTION', 'RETURN']
    const refType: ReferenceType = b.referenceType ?? 'PURCHASE_ORDER'
    if (!VALID_REF_TYPES.includes(refType)) return err(`referenceType must be one of: ${VALID_REF_TYPES.join(', ')}`)

    const passQty = Number(b.passQty ?? 0)
    const failQty = Number(b.failQty ?? 0)
    if (passQty < 0 || failQty < 0) return err('passQty and failQty must be >= 0')

    const t = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO QCInspection (id, storeId, productId, referenceId, referenceType, inspectedBy, inspectedAt, status, passQty, failQty, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?)`,
      [id, storeId, b.productId, b.referenceId ?? null, refType, b.inspectedBy, t, passQty, failQty, b.notes ?? null, t, t]
    )

    if (Array.isArray(b.checkpoints)) {
      for (const cp of b.checkpoints) {
        if (!cp.criterion) continue
        const cpId = newId()
        await exec(
          `INSERT INTO QCCheckpoint (id, inspectionId, storeId, criterion, result, value, threshold, notes, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cpId, id, storeId, cp.criterion, cp.result ?? 'NA', cp.value ?? null, cp.threshold ?? null, cp.notes ?? null, t, t]
        )
      }
    }

    return ok({ id }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
