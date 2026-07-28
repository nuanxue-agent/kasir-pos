// GET/POST /api/variant-attributes
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import { ensureVariantTables } from '../product-variants/route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

// GET /api/variant-attributes?storeId=&productId=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    const productId = url.searchParams.get('productId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureVariantTables()

    let sql = `SELECT * FROM VariantAttribute WHERE storeId = ?`
    const params: unknown[] = [storeId]
    if (productId) { sql += ` AND productId = ?`; params.push(productId) }
    sql += ` ORDER BY createdAt ASC`

    const rows = await query(sql, params) as any[]
    const attrs = rows.map(r => ({
      ...r,
      values: JSON.parse(r.values ?? '[]'),
    }))

    return ok(attrs)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/variant-attributes
// Body: { storeId, productId, name, values } — creates new attribute
// Body: { storeId, action: 'updateValues', id, values } — updates values on existing
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    await ensureVariantTables()

    const b = (await req.json()) as any
    if (!b.storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === b.storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    // Update values on existing attribute
    if (b.action === 'updateValues') {
      if (!b.id) return err('id required for updateValues')
      if (!Array.isArray(b.values)) return err('values must be an array')

      const existing = await queryOne(
        `SELECT * FROM VariantAttribute WHERE id = ? AND storeId = ?`,
        [b.id, b.storeId]
      ) as any
      if (!existing) return err('Attribute not found', 404)

      const t = nowISO()
      await exec(
        `UPDATE VariantAttribute SET values = ?, updatedAt = ? WHERE id = ? AND storeId = ?`,
        [JSON.stringify(b.values), t, b.id, b.storeId]
      )

      return ok({ ...existing, values: b.values })
    }

    // Create new attribute
    if (!b.productId) return err('productId required')
    if (!b.name) return err('name required')

    // Check for duplicate name on same product
    const dup = await queryOne(
      `SELECT id FROM VariantAttribute WHERE storeId = ? AND productId = ? AND name = ?`,
      [b.storeId, b.productId, b.name.toLowerCase()]
    ) as any
    if (dup) return err(`Attribute "${b.name}" already exists for this product`)

    const t = nowISO()
    const id = newId()
    const values = Array.isArray(b.values) ? b.values : []

    await exec(
      `INSERT INTO VariantAttribute (id, storeId, productId, name, values, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, b.storeId, b.productId, b.name.toLowerCase(), JSON.stringify(values), t, t]
    )

    return ok({
      id, storeId: b.storeId, productId: b.productId,
      name: b.name.toLowerCase(), values,
    }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
