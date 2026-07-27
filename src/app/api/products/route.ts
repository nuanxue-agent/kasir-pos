import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { query, exec, batch, newId, toSQLiteDate } from '@/lib/db'

export const runtime = 'edge'

// GET /api/products?storeId=xxx&categoryId=xxx&search=xxx&page=1
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  const categoryId = searchParams.get('categoryId')
  const search = searchParams.get('search') || searchParams.get('q')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '50')

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const { env } = getRequestContext()
  const db = env.DB

  // Build WHERE clause
  const conditions = ['p.storeId = ?', 'p.active = 1']
  const params: any[] = [storeId]

  if (categoryId) {
    conditions.push('p.categoryId = ?')
    params.push(categoryId)
  }

  if (search) {
    conditions.push('(p.name LIKE ? OR p.sku LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }

  const whereClause = conditions.join(' AND ')

  // Fetch products
  const sql = `
    SELECT 
      p.*,
      c.name as categoryName,
      c.color as categoryColor
    FROM Product p
    LEFT JOIN Category c ON p.categoryId = c.id
    WHERE ${whereClause}
    ORDER BY p.name
    LIMIT ? OFFSET ?
  `
  params.push(limit, (page - 1) * limit)

  const products = await query(db, sql, params)

  // Get total count
  const countSql = `SELECT COUNT(*) as total FROM Product p WHERE ${whereClause}`
  const countResult = await query<{ total: number }>(
    db,
    countSql,
    params.slice(0, -2) // Remove limit and offset
  )
  const total = countResult[0]?.total || 0

  // Fetch variants for each product (optional, can be optimized)
  for (const product of products) {
    const variants = await query(
      db,
      'SELECT * FROM ProductVariant WHERE productId = ? AND active = 1',
      [product.id]
    )
    ;(product as any).variants = variants
  }

  return NextResponse.json({ 
    products, 
    total, 
    page, 
    pages: Math.ceil(total / limit) 
  })
}

// POST /api/products
const createSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().positive(),
  cost: z.number().min(0).default(0),
  categoryId: z.string().optional(),
  trackStock: z.boolean().default(true),
  stock: z.number().int().min(0).default(0),
  lowStock: z.number().int().min(0).default(5),
  active: z.boolean().default(true),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data
  const { env } = getRequestContext()
  const db = env.DB

  const id = newId()
  const now = toSQLiteDate(new Date())

  const statements = [
    {
      sql: `
        INSERT INTO Product (
          id, storeId, name, description, sku, barcode, 
          price, cost, categoryId, trackStock, stock, lowStock, 
          active, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        id,
        data.storeId,
        data.name,
        data.description || null,
        data.sku || null,
        data.barcode || null,
        data.price,
        data.cost,
        data.categoryId || null,
        data.trackStock ? 1 : 0,
        data.stock,
        data.lowStock,
        data.active ? 1 : 0,
        now,
        now,
      ],
    },
  ]

  // Add initial stock log if stock > 0
  if (data.stock > 0) {
    statements.push({
      sql: `
        INSERT INTO StockLog (id, productId, type, qty, note, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      params: [newId(), id, 'INITIAL', data.stock, 'Initial stock', now],
    })
  }

  await batch(db, statements)

  // Fetch the created product with category
  const product = await query(
    db,
    `
      SELECT 
        p.*,
        c.name as categoryName,
        c.color as categoryColor
      FROM Product p
      LEFT JOIN Category c ON p.categoryId = c.id
      WHERE p.id = ?
    `,
    [id]
  )

  return NextResponse.json(product[0], { status: 201 })
}
