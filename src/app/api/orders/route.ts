import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { query, batch, newId, toSQLiteDate } from '@/lib/db'

export const runtime = 'edge'

// GET /api/orders?storeId=xxx&status=PAID&page=1
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  const status = searchParams.get('status')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '20')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const { env } = getRequestContext()
  const db = env.DB

  // Build WHERE clause
  const conditions = ['o.storeId = ?']
  const params: any[] = [storeId]

  if (status) {
    conditions.push('o.status = ?')
    params.push(status)
  }

  if (dateFrom) {
    conditions.push('o.createdAt >= ?')
    params.push(toSQLiteDate(new Date(dateFrom)))
  }

  if (dateTo) {
    conditions.push('o.createdAt <= ?')
    params.push(toSQLiteDate(new Date(dateTo)))
  }

  const whereClause = conditions.join(' AND ')

  // Fetch orders with user and customer info
  const sql = `
    SELECT 
      o.*,
      u.name as userName,
      c.name as customerName
    FROM "Order" o
    LEFT JOIN User u ON o.userId = u.id
    LEFT JOIN Customer c ON o.customerId = c.id
    WHERE ${whereClause}
    ORDER BY o.createdAt DESC
    LIMIT ? OFFSET ?
  `
  params.push(limit, (page - 1) * limit)

  const orders = await query(db, sql, params)

  // Get total count
  const countSql = `SELECT COUNT(*) as total FROM "Order" o WHERE ${whereClause}`
  const countResult = await query<{ total: number }>(
    db,
    countSql,
    params.slice(0, -2) // Remove limit and offset
  )
  const total = countResult[0]?.total || 0

  // Fetch items and payments for each order
  for (const order of orders) {
    const items = await query(
      db,
      `
        SELECT 
          oi.*,
          p.name as productName
        FROM OrderItem oi
        LEFT JOIN Product p ON oi.productId = p.id
        WHERE oi.orderId = ?
      `,
      [order.id]
    )
    ;(order as any).items = items

    const payments = await query(
      db,
      'SELECT * FROM Payment WHERE orderId = ?',
      [order.id]
    )
    ;(order as any).payments = payments
  }

  return NextResponse.json({ 
    orders, 
    total, 
    page, 
    pages: Math.ceil(total / limit) 
  })
}

// POST /api/orders -- create a new order (checkout)
const checkoutSchema = z.object({
  storeId: z.string(),
  userId: z.string(),
  customerId: z.string().optional(),
  discountId: z.string().optional(),
  note: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    variantId: z.string().optional(),
    name: z.string(),
    variantName: z.string().optional(),
    price: z.number().positive(),
    qty: z.number().int().positive(),
    discount: z.number().min(0).default(0),
    subtotal: z.number(),
  })),
  payments: z.array(z.object({
    method: z.enum(['CASH', 'CARD', 'TRANSFER', 'QRIS', 'OTHER']),
    amount: z.number().positive(),
    reference: z.string().optional(),
    change: z.number().min(0).default(0),
  })),
  subtotal: z.number(),
  discountAmt: z.number().min(0).default(0),
  taxAmt: z.number().min(0).default(0),
  total: z.number(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = checkoutSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data
  const { env } = getRequestContext()
  const db = env.DB

  // Generate order number
  const orderNumber = `INV-${Date.now()}`
  const orderId = newId()
  const now = toSQLiteDate(new Date())

  // Build batch statements
  const statements = []

  // 1. Insert order
  statements.push({
    sql: `
      INSERT INTO "Order" (
        id, storeId, number, status, userId, customerId, discountId, note,
        subtotal, discountAmt, taxAmt, total, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    params: [
      orderId,
      data.storeId,
      orderNumber,
      'PAID',
      data.userId,
      data.customerId || null,
      data.discountId || null,
      data.note || null,
      data.subtotal,
      data.discountAmt,
      data.taxAmt,
      data.total,
      now,
      now,
    ],
  })

  // 2. Insert order items and deduct stock
  for (const item of data.items) {
    const itemId = newId()
    
    statements.push({
      sql: `
        INSERT INTO OrderItem (
          id, orderId, productId, variantId, name, variantName, 
          price, qty, discount, subtotal, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        itemId,
        orderId,
        item.productId,
        item.variantId || null,
        item.name,
        item.variantName || null,
        item.price,
        item.qty,
        item.discount,
        item.subtotal,
        now,
        now,
      ],
    })

    // Deduct stock
    statements.push({
      sql: 'UPDATE Product SET stock = stock - ? WHERE id = ?',
      params: [item.qty, item.productId],
    })

    // Insert stock log
    statements.push({
      sql: `
        INSERT INTO StockLog (id, productId, type, qty, note, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      params: [newId(), item.productId, 'SALE', -item.qty, `Order ${orderNumber}`, now],
    })
  }

  // 3. Insert payments
  for (const payment of data.payments) {
    statements.push({
      sql: `
        INSERT INTO Payment (
          id, orderId, method, amount, reference, change, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        newId(),
        orderId,
        payment.method,
        payment.amount,
        payment.reference || null,
        payment.change,
        now,
        now,
      ],
    })
  }

  // Execute batch
  await batch(db, statements)

  // Fetch created order with items and payments
  const order = await query(
    db,
    `
      SELECT 
        o.*,
        u.name as userName,
        c.name as customerName
      FROM "Order" o
      LEFT JOIN User u ON o.userId = u.id
      LEFT JOIN Customer c ON o.customerId = c.id
      WHERE o.id = ?
    `,
    [orderId]
  )

  if (order.length === 0) {
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }

  // Fetch items
  const items = await query(
    db,
    'SELECT * FROM OrderItem WHERE orderId = ?',
    [orderId]
  )

  // Fetch payments
  const payments = await query(
    db,
    'SELECT * FROM Payment WHERE orderId = ?',
    [orderId]
  )

  const result = {
    ...order[0],
    items,
    payments,
  }

  return NextResponse.json(result, { status: 201 })
}
