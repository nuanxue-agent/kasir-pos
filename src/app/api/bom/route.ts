import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureBOMTable() {
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

  await ensureBOMTable()

  const productId = req.nextUrl.searchParams.get('productId')
  const conditions: string[] = ['b.storeId = ?']
  const params: any[] = [storeId]

  if (productId) { conditions.push('b.productId = ?'); params.push(productId) }

  const rows = await query(
    `SELECT b.*, p.name AS materialName, p.sku AS materialSku, p.cost AS materialCost
     FROM BillOfMaterials b
     LEFT JOIN Product p ON p.id = b.materialId
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.productId, b.id`,
    params,
  ).catch(async () => {
    let sql = `SELECT * FROM BillOfMaterials WHERE storeId = ?`
    const p: any[] = [storeId]
    if (productId) { sql += ` AND productId = ?`; p.push(productId) }
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

  await ensureBOMTable()

  const b = (await req.json()) as any
  if (!b.productId)  return err("'productId' is required",  400, 'MISSING_FIELD')
  if (!b.materialId) return err("'materialId' is required", 400, 'MISSING_FIELD')

  const qty = Number(b.qty ?? 1)
  if (qty <= 0) return err("'qty' must be positive", 400, 'INVALID_FIELD')

  // Prevent duplicate BOM entry for same product+material
  const existing = await query(
    `SELECT id FROM BillOfMaterials WHERE storeId = ? AND productId = ? AND materialId = ?`,
    [storeId, b.productId, b.materialId],
  ) as any[]
  if (existing.length) return err('BOM entry already exists for this product+material', 409, 'DUPLICATE')

  const id = newId()
  await exec(
    `INSERT INTO BillOfMaterials (id, storeId, productId, materialId, qty, unit)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, storeId, b.productId, b.materialId, qty, b.unit ?? null],
  )

  const [created] = await query(`SELECT * FROM BillOfMaterials WHERE id = ?`, [id]) as any[]
  return NextResponse.json(created, { status: 201 })
}
