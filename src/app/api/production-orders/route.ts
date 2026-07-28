import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureProductionTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ProductionOrder (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    productId     TEXT NOT NULL,
    qty           REAL NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'DRAFT',
    scheduledDate TEXT,
    completedDate TEXT,
    notes         TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ProductionMaterial (
    id               TEXT PRIMARY KEY,
    orderId          TEXT NOT NULL,
    storeId          TEXT NOT NULL,
    materialProductId TEXT NOT NULL,
    requiredQty      REAL NOT NULL DEFAULT 0,
    usedQty          REAL NOT NULL DEFAULT 0
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS BillOfMaterials (
    id         TEXT PRIMARY KEY,
    storeId    TEXT NOT NULL,
    productId  TEXT NOT NULL,
    materialId TEXT NOT NULL,
    qty        REAL NOT NULL DEFAULT 1,
    unit       TEXT
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureProductionTables()

  const status = req.nextUrl.searchParams.get('status')
  const productId = req.nextUrl.searchParams.get('productId')

  const conditions: string[] = ['po.storeId = ?']
  const params: any[] = [storeId]

  if (status) { conditions.push('po.status = ?'); params.push(status) }
  if (productId) { conditions.push('po.productId = ?'); params.push(productId) }

  const rows = await query(
    `SELECT po.*, p.name AS productName
     FROM ProductionOrder po
     LEFT JOIN Product p ON p.id = po.productId
     WHERE ${conditions.join(' AND ')}
     ORDER BY po.createdAt DESC`,
    params,
  ).catch(async () => {
    let sql = `SELECT * FROM ProductionOrder WHERE storeId = ?`
    const p: any[] = [storeId]
    if (status) { sql += ` AND status = ?`; p.push(status) }
    sql += ` ORDER BY createdAt DESC`
    return query(sql, p)
  })

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureProductionTables()

  const b = (await req.json()) as any
  if (!b.productId) return err("'productId' is required", 400, 'MISSING_FIELD')

  const qty = Number(b.qty ?? 1)
  if (qty <= 0) return err("'qty' must be positive", 400, 'INVALID_FIELD')

  const id = newId()
  const now = nowISO()

  await exec(
    `INSERT INTO ProductionOrder (id, storeId, productId, qty, status, scheduledDate, completedDate, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 'DRAFT', ?, NULL, ?, ?, ?)`,
    [id, storeId, b.productId, qty, b.scheduledDate ?? null, b.notes ?? null, now, now],
  )

  // Auto-populate materials from BOM
  const bomRows = await query(
    `SELECT * FROM BillOfMaterials WHERE storeId = ? AND productId = ?`,
    [storeId, b.productId],
  ).catch(() => [] as any[])

  for (const line of bomRows as any[]) {
    await exec(
      `INSERT INTO ProductionMaterial (id, orderId, storeId, materialProductId, requiredQty, usedQty)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [newId(), id, storeId, line.materialId, Number(line.qty) * qty],
    )
  }

  const [created] = await query(`SELECT * FROM ProductionOrder WHERE id = ?`, [id]) as any[]
  return NextResponse.json(created, { status: 201 })
}
