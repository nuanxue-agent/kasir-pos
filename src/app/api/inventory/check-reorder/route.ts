import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'

// Lazy-init ReorderRule table
async function ensureReorderTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS ReorderRule (
      id           TEXT PRIMARY KEY,
      storeId      TEXT NOT NULL,
      productId    TEXT NOT NULL,
      reorderPoint REAL NOT NULL DEFAULT 0,
      reorderQty   REAL NOT NULL DEFAULT 1,
      supplierId   TEXT,
      createdAt    TEXT NOT NULL,
      updatedAt    TEXT NOT NULL,
      UNIQUE(storeId, productId)
    )
  `)
  await exec(`CREATE INDEX IF NOT EXISTS idx_reorder_rule_store ON ReorderRule(storeId)`)
}

interface ReorderRule {
  id: string
  storeId: string
  productId: string
  reorderPoint: number
  reorderQty: number
  supplierId?: string | null
}

interface Product {
  id: string
  name: string
  sku?: string | null
  stock: number
}

/**
 * POST /api/inventory/check-reorder
 * Body: { storeId: string }
 * Checks all ReorderRules for the store, and for each product below its
 * reorder point, creates a DRAFT PurchaseOrder if one doesn't already exist.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json() as Record<string, any>
    const { storeId } = body
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    await ensureReorderTable()

    // Load all reorder rules for this store
    const rules = await query<ReorderRule>(
      `SELECT * FROM ReorderRule WHERE storeId = ?`,
      [storeId],
    )

    if (rules.length === 0) {
      return NextResponse.json({ created: 0, message: 'No reorder rules configured' })
    }

    const productIds = rules.map(r => r.productId)
    const placeholders = productIds.map(() => '?').join(',')
    const products = await query<Product>(
      `SELECT id, name, sku, stock FROM Product WHERE id IN (${placeholders}) AND storeId = ?`,
      [...productIds, storeId],
    )
    const productMap = Object.fromEntries(products.map(p => [p.id, p]))

    let created = 0
    const triggeredProducts: string[] = []

    for (const rule of rules) {
      const product = productMap[rule.productId]
      if (!product) continue
      if (product.stock > rule.reorderPoint) continue

      // Check if there's already a DRAFT PO for this product/supplier combo
      const existing = await queryOne<any>(
        `SELECT po.id FROM PurchaseOrder po
         JOIN PurchaseOrderLine pol ON pol.orderId = po.id
         WHERE po.storeId = ? AND po.status = 'DRAFT'
           AND pol.productId = ?
           ${rule.supplierId ? 'AND po.supplierId = ?' : ''}
         LIMIT 1`,
        rule.supplierId
          ? [storeId, rule.productId, rule.supplierId]
          : [storeId, rule.productId],
      )

      if (existing) continue // Already have a draft PO

      // Generate PO number
      const now = nowISO()
      const dateStr = now.slice(0, 10).replace(/-/g, '')
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
      const poNumber = `AUTO-${dateStr}-${rand}`

      const unitCost = 0 // To be filled in by purchasing team
      const subtotal = rule.reorderQty * unitCost

      const poId = newId()
      await exec(
        `INSERT INTO PurchaseOrder (id, storeId, supplierId, userId, number, status, expectedDate, subtotal, taxAmt, total, note, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, 0, ?, ?, ?, ?)`,
        [
          poId,
          storeId,
          rule.supplierId ?? null,
          (session.user as any)?.id ?? null,
          poNumber,
          null,
          subtotal,
          subtotal,
          `Auto-generated: ${product.name} stock (${product.stock}) ≤ reorder point (${rule.reorderPoint})`,
          now,
          now,
        ],
      )

      const lineId = newId()
      await exec(
        `INSERT INTO PurchaseOrderLine (id, orderId, productId, productName, qty, unitCost, receivedQty, subtotal, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [lineId, poId, rule.productId, product.name, rule.reorderQty, unitCost, subtotal, now],
      )

      created++
      triggeredProducts.push(product.name)
    }

    return NextResponse.json({
      created,
      triggeredProducts,
      message: created > 0
        ? `Created ${created} draft PO(s) for: ${triggeredProducts.join(', ')}`
        : 'All products above reorder point',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * GET /api/inventory/check-reorder?storeId=xxx
 * Returns all ReorderRules for the store with product info.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  try {
    await ensureReorderTable()
    const rules = await query<any>(
      `SELECT rr.*, p.name as productName, p.sku, p.stock,
              s.name as supplierName
       FROM ReorderRule rr
       LEFT JOIN Product p ON p.id = rr.productId
       LEFT JOIN Supplier s ON s.id = rr.supplierId
       WHERE rr.storeId = ?
       ORDER BY p.name ASC`,
      [storeId],
    )
    return NextResponse.json({ rules })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * PUT /api/inventory/check-reorder
 * Upsert a ReorderRule for a product.
 */
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json() as Record<string, any>
    const { storeId, productId, reorderPoint, reorderQty, supplierId } = body

    if (!storeId || !productId || reorderPoint == null || reorderQty == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    await ensureReorderTable()

    const existing = await queryOne<ReorderRule>(
      `SELECT * FROM ReorderRule WHERE storeId = ? AND productId = ?`,
      [storeId, productId],
    )
    const now = nowISO()

    if (existing) {
      await exec(
        `UPDATE ReorderRule SET reorderPoint = ?, reorderQty = ?, supplierId = ?, updatedAt = ?
         WHERE storeId = ? AND productId = ?`,
        [Number(reorderPoint), Number(reorderQty), supplierId ?? null, now, storeId, productId],
      )
      return NextResponse.json({ id: existing.id, updated: true })
    } else {
      const id = newId()
      await exec(
        `INSERT INTO ReorderRule (id, storeId, productId, reorderPoint, reorderQty, supplierId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, storeId, productId, Number(reorderPoint), Number(reorderQty), supplierId ?? null, now, now],
      )
      return NextResponse.json({ id, updated: false }, { status: 201 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
