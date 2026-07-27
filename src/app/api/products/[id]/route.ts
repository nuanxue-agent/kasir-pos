import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { query, exec, toSQLiteDate } from '@/lib/db'

export const runtime = 'edge'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().positive().optional(),
  cost: z.number().min(0).optional(),
  categoryId: z.string().optional(),
  trackStock: z.boolean().optional(),
  stock: z.number().int().min(0).optional(),
  lowStock: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
})

// PATCH /api/products/:id - Update product
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data
    const { env } = getRequestContext()
    const db = env.DB

    // Build SET clause dynamically
    const updates: string[] = []
    const values: any[] = []

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = ?`)
        // Convert booleans to integers for SQLite
        if (typeof value === 'boolean') {
          values.push(value ? 1 : 0)
        } else {
          values.push(value)
        }
      }
    })

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.push('updatedAt = ?')
    values.push(toSQLiteDate(new Date()))

    // Add id to params
    values.push(id)

    const sql = `UPDATE Product SET ${updates.join(', ')} WHERE id = ?`
    await exec(db, sql, values)

    // Fetch updated product with category
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

    if (product.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json(product[0])
  } catch (error: any) {
    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update product' },
      { status: 500 }
    )
  }
}

// DELETE /api/products/:id - Soft delete (set active=false)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const { env } = getRequestContext()
    const db = env.DB

    const now = toSQLiteDate(new Date())
    await exec(db, 'UPDATE Product SET active = 0, updatedAt = ? WHERE id = ?', [now, id])

    // Fetch updated product with category
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

    if (product.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json(product[0])
  } catch (error: any) {
    console.error('Error deleting product:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete product' },
      { status: 500 }
    )
  }
}
