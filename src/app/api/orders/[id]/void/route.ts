import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { query, batch, toSQLiteDate, newId } from '@/lib/db'

export const runtime = 'edge'

// POST /api/orders/:id/void
// Void a paid order and restore stock
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: orderId } = await params
  const { env } = getRequestContext()
  const db = env.DB

  // Fetch the order
  const orders = await query(
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

  if (orders.length === 0) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const order = orders[0] as any

  if (order.status !== 'PAID') {
    return NextResponse.json(
      { error: 'Only PAID orders can be voided' },
      { status: 400 }
    )
  }

  // Fetch order items
  const items = await query(
    db,
    `
      SELECT 
        oi.*,
        p.trackStock
      FROM OrderItem oi
      LEFT JOIN Product p ON oi.productId = p.id
      WHERE oi.orderId = ?
    `,
    [orderId]
  )

  // Build batch statements to void order and restore stock
  const statements = []
  const now = toSQLiteDate(new Date())

  // 1. Update order status to VOIDED
  statements.push({
    sql: 'UPDATE "Order" SET status = ?, updatedAt = ? WHERE id = ?',
    params: ['VOIDED', now, orderId],
  })

  // 2. Restore stock for each item that tracks stock
  for (const item of items as any[]) {
    if (item.trackStock) {
      // Increment product stock
      statements.push({
        sql: 'UPDATE Product SET stock = stock + ? WHERE id = ?',
        params: [item.qty, item.productId],
      })

      // Create VOID stock log entry
      statements.push({
        sql: `
          INSERT INTO StockLog (id, productId, type, qty, note, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        params: [newId(), item.productId, 'VOID', item.qty, `Voided order ${order.number}`, now],
      })
    }
  }

  // Execute batch
  await batch(db, statements)

  // Fetch updated order with items and payments
  const updatedOrder = await query(
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

  // Fetch items
  const updatedItems = await query(
    db,
    `
      SELECT 
        oi.*,
        p.name as productName
      FROM OrderItem oi
      LEFT JOIN Product p ON oi.productId = p.id
      WHERE oi.orderId = ?
    `,
    [orderId]
  )

  // Fetch payments
  const payments = await query(
    db,
    'SELECT * FROM Payment WHERE orderId = ?',
    [orderId]
  )

  const result = {
    ...updatedOrder[0],
    items: updatedItems,
    payments,
  }

  return NextResponse.json(result)
}
