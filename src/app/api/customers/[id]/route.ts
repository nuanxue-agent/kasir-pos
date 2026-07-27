import { getRequestContext } from '@cloudflare/next-on-pages'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, exec, toSQLiteDate } from '@/lib/db'

export const runtime = 'edge'


// GET /api/customers/:id — single customer + last 10 orders
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { env } = getRequestContext()
  const db = env.DB

  const customer = await queryOne(db, `SELECT * FROM Customer WHERE id = ?`, [id])
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [orders, totalSpentRow] = await Promise.all([
    query<{
      id: string; storeId: string; customerId: string; status: string
      total: number; subtotal: number; taxAmt: number; discountAmt: number
      createdAt: string
    }>(db, `
      SELECT * FROM \`Order\`
      WHERE customerId = ?
      ORDER BY createdAt DESC
      LIMIT 10
    `, [id]),
    queryOne<{ totalSpent: number }>(db, `
      SELECT COALESCE(SUM(total), 0) as totalSpent
      FROM \`Order\`
      WHERE customerId = ? AND status = 'PAID'
    `, [id]),
  ])

  const totalOrdersRow = await queryOne<{ total: number }>(db,
    `SELECT COUNT(*) as total FROM \`Order\` WHERE customerId = ?`, [id]
  )

  return NextResponse.json({
    ...customer,
    orders,
    totalOrders: totalOrdersRow?.total ?? 0,
    totalSpent: totalSpentRow?.totalSpent ?? 0,
  })
}

// PATCH /api/customers/:id
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  points: z.number().int().min(0).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { env } = getRequestContext()
  const db = env.DB

  const data = parsed.data
  const fields: string[] = []
  const values: any[] = []

  if (data.name !== undefined)    { fields.push('name = ?');    values.push(data.name) }
  if (data.phone !== undefined)   { fields.push('phone = ?');   values.push(data.phone) }
  if (data.email !== undefined)   { fields.push('email = ?');   values.push(data.email || null) }
  if (data.address !== undefined) { fields.push('address = ?'); values.push(data.address) }
  if (data.points !== undefined)  { fields.push('points = ?');  values.push(data.points) }

  if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  fields.push('updatedAt = ?')
  values.push(toSQLiteDate(new Date()))
  values.push(id)

  try {
    await exec(db, `UPDATE Customer SET ${fields.join(', ')} WHERE id = ?`, values)
    const customer = await queryOne(db, `SELECT * FROM Customer WHERE id = ?`, [id])
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(customer)
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE')) {
      return NextResponse.json(
        { error: 'A customer with that phone or email already exists' },
        { status: 409 }
      )
    }
    throw err
  }
}

// DELETE /api/customers/:id — only if no orders
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { env } = getRequestContext()
  const db = env.DB

  const orderCount = await queryOne<{ total: number }>(db,
    `SELECT COUNT(*) as total FROM \`Order\` WHERE customerId = ?`, [id]
  )
  if ((orderCount?.total ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Cannot delete a customer with existing orders' },
      { status: 409 }
    )
  }

  const result = await exec(db, `DELETE FROM Customer WHERE id = ?`, [id])
  if (result.meta.changes === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
