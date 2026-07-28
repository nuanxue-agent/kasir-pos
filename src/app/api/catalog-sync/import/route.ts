// POST /api/catalog-sync/import  — bulk import products from parsed CSV rows
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

interface ImportRow {
  name: string
  sku?: string
  price: number
  cost?: number
  stock?: number
  categoryName?: string
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const b = (await req.json()) as any
  const rows: ImportRow[] = b.rows ?? []

  if (!Array.isArray(rows) || rows.length === 0) {
    return err('rows array is required and must not be empty', 400, 'MISSING_FIELD')
  }
  if (rows.length > 500) {
    return err('Maximum 500 rows per import', 400, 'LIMIT_EXCEEDED')
  }

  // Fetch existing SKUs for duplicate detection
  const existingProducts = await query(
    `SELECT id, sku FROM Product WHERE storeId = ? AND sku IS NOT NULL AND sku != ''`,
    [storeId],
  )
  const existingSkuMap = new Map<string, string>(
    (existingProducts as any[]).map(p => [p.sku as string, p.id as string]),
  )

  const now = nowISO()
  let created = 0
  let updated = 0
  const errors: { row: number; message: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row.name || row.name.trim() === '') {
      errors.push({ row: i + 1, message: 'name is required' })
      continue
    }
    if (row.price == null || isNaN(Number(row.price)) || Number(row.price) < 0) {
      errors.push({ row: i + 1, message: 'price must be a non-negative number' })
      continue
    }

    const sku = row.sku?.trim() ?? ''
    const price = Number(row.price)
    const cost = row.cost != null ? Number(row.cost) : 0
    const stock = row.stock != null ? Number(row.stock) : 0

    if (sku && existingSkuMap.has(sku)) {
      // Update existing product
      const existingId = existingSkuMap.get(sku)!
      await exec(
        `UPDATE Product SET name = ?, price = ?, cost = ?, updatedAt = ? WHERE id = ? AND storeId = ?`,
        [row.name.trim(), price, cost, now, existingId, storeId],
      )
      updated++
    } else {
      // Create new product
      const id = newId()
      await exec(
        `INSERT INTO Product (id, storeId, name, sku, price, cost, stock, trackStock, active, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          storeId,
          row.name.trim(),
          sku || null,
          price,
          cost,
          stock,
          stock > 0 ? 1 : 0,
          1,
          now,
          now,
        ],
      )
      if (sku) existingSkuMap.set(sku, id)
      created++
    }
  }

  return NextResponse.json({ created, updated, errors, total: rows.length })
}
