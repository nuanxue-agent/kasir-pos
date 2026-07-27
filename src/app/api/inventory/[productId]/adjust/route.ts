import { getRequestContext } from '@cloudflare/next-on-pages'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, batch, newId, toSQLiteDate } from '@/lib/db'

export const runtime = 'edge'


const adjustSchema = z.object({
  type: z.enum(['ADJUSTMENT', 'RESTOCK']),
  qty: z.number().int().refine(val => val !== 0, 'Qty cannot be 0'),
  note: z.string().optional(),
})

// POST /api/inventory/:productId/adjust
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { productId } = await params
  const body = await req.json()
  const parsed = adjustSchema.safeParse(body)
  
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { type, qty, note } = parsed.data

  const { env } = getRequestContext()
  const db = env.DB

  // Get product
  const product = await queryOne<{
    id: string; stock: number; trackStock: number
  }>(db, `SELECT id, stock, trackStock FROM Product WHERE id = ?`, [productId])

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  if (!product.trackStock) {
    return NextResponse.json({ error: 'Product does not track stock' }, { status: 400 })
  }

  // Calculate new stock
  const newStock = Math.max(0, product.stock + qty)
  const now = toSQLiteDate(new Date())
  const logId = newId()

  // Update product and create log in batch
  await batch(db, [
    {
      sql: `UPDATE Product SET stock = ?, updatedAt = ? WHERE id = ?`,
      params: [newStock, now, productId],
    },
    {
      sql: `INSERT INTO StockLog (id, productId, type, qty, note, createdAt)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [logId, productId, type, qty, note || (type === 'RESTOCK' ? 'Stock restock' : 'Stock adjustment'), now],
    },
  ])

  // Return updated product with category
  const updatedProduct = await queryOne(db, `
    SELECT p.*, c.name as categoryName
    FROM Product p
    LEFT JOIN Category c ON p.categoryId = c.id
    WHERE p.id = ?
  `, [productId])

  return NextResponse.json(updatedProduct)
}
