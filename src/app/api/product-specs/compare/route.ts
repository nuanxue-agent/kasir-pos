import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureSpecTable() {
  await exec(`CREATE TABLE IF NOT EXISTS ProductSpec (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    productId    TEXT NOT NULL,
    specName     TEXT NOT NULL,
    specValue    TEXT NOT NULL DEFAULT '',
    specGroup    TEXT NOT NULL DEFAULT 'General',
    displayOrder INTEGER NOT NULL DEFAULT 0,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
}

// POST /api/product-specs/compare
// Body: { storeId?, productIds: string[] }
// Returns: comparison matrix grouped by specGroup → specName → { [productId]: specValue }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const body = (await req.json()) as any
    const user = session.user as { stores?: { id: string }[] }
    const storeId: string = body.storeId ?? user.stores?.[0]?.id ?? ''
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some(s => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    const productIds: string[] = body.productIds ?? []
    if (!Array.isArray(productIds) || productIds.length < 2)
      return err('At least 2 productIds required')
    if (productIds.length > 4) return err('Maximum 4 products for comparison')

    await ensureSpecTable()

    // Fetch product details
    const placeholders = productIds.map(() => '?').join(', ')
    const productsRaw = await query(
      `SELECT id, name, price, cost, sku, stock, categoryId, image FROM Product
       WHERE storeId = ? AND id IN (${placeholders}) ORDER BY name`,
      [storeId, ...productIds],
    )
    const products = productsRaw as any[]

    // Fetch all specs for these products
    const specsRaw = await query(
      `SELECT * FROM ProductSpec WHERE storeId = ? AND productId IN (${placeholders})
       ORDER BY specGroup, displayOrder, specName`,
      [storeId, ...productIds],
    )
    const specs = specsRaw as any[]

    // Build union of all spec keys, preserving order
    const specKeyOrder: { group: string; name: string }[] = []
    const seen = new Set<string>()
    for (const s of specs) {
      const key = `${s.specGroup}||${s.specName}`
      if (!seen.has(key)) {
        seen.add(key)
        specKeyOrder.push({ group: s.specGroup, name: s.specName })
      }
    }

    // Build lookup: productId → specGroup+specName → specValue
    const lookup: Record<string, Record<string, string>> = {}
    for (const s of specs) {
      if (!lookup[s.productId]) lookup[s.productId] = {}
      lookup[s.productId][`${s.specGroup}||${s.specName}`] = s.specValue
    }

    // Build matrix: group → specName → { [productId]: value | 'N/A' }
    const matrix: Record<string, Record<string, Record<string, string>>> = {}
    for (const { group, name } of specKeyOrder) {
      if (!matrix[group]) matrix[group] = {}
      matrix[group][name] = {}
      for (const pid of productIds) {
        matrix[group][name][pid] = lookup[pid]?.[`${group}||${name}`] ?? 'N/A'
      }
    }

    return ok({ products, matrix, specKeyOrder })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
