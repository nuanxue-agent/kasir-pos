// GET/POST /api/product-costs
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureProductCostTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ProductCost (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    productId    TEXT NOT NULL,
    materialCost REAL NOT NULL DEFAULT 0,
    laborCost    REAL NOT NULL DEFAULT 0,
    overheadCost REAL NOT NULL DEFAULT 0,
    totalCost    REAL NOT NULL DEFAULT 0,
    effectiveDate TEXT NOT NULL,
    notes        TEXT,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureProductCostTables()

    const productId = sp.get('productId')
    const rows = productId
      ? await query(
          `SELECT pc.*, p.name as productName
           FROM ProductCost pc
           LEFT JOIN Product p ON pc.productId = p.id
           WHERE pc.storeId = ? AND pc.productId = ?
           ORDER BY pc.effectiveDate DESC`,
          [storeId, productId],
        )
      : await query(
          `SELECT pc.*, p.name as productName
           FROM ProductCost pc
           LEFT JOIN Product p ON pc.productId = p.id
           WHERE pc.storeId = ?
           ORDER BY pc.effectiveDate DESC`,
          [storeId],
        )

    return ok(rows)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureProductCostTables()

    const b = (await req.json()) as any
    if (!b.productId) return err("Field 'productId' is required")
    if (!b.effectiveDate) return err("Field 'effectiveDate' is required")

    const materialCost = Number(b.materialCost ?? 0)
    const laborCost = Number(b.laborCost ?? 0)
    const overheadCost = Number(b.overheadCost ?? 0)
    const totalCost = materialCost + laborCost + overheadCost

    const t = nowISO()
    const id = newId()
    await exec(
      `INSERT INTO ProductCost
        (id, storeId, productId, materialCost, laborCost, overheadCost, totalCost, effectiveDate, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, b.productId, materialCost, laborCost, overheadCost, totalCost,
       b.effectiveDate, b.notes ?? null, t, t],
    )
    return ok({ id, totalCost }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
