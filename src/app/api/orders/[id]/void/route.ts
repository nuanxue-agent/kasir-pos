import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

  // Fetch the order with items
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: true } },
      payments: true,
      customer: true,
      user: { select: { id: true, name: true } },
    },
  })

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.status !== 'PAID') {
    return NextResponse.json(
      { error: 'Only PAID orders can be voided' },
      { status: 400 }
    )
  }

  // Update order status and restore stock in a transaction
  const updated = await prisma.$transaction(async (tx) => {
    // Update order status
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: 'VOIDED' },
      include: {
        items: { include: { product: true } },
        payments: true,
        customer: true,
        user: { select: { id: true, name: true } },
      },
    })

    // Restore stock for each item
    for (const item of order.items) {
      if (item.product.trackStock) {
        // Increment product stock
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.qty } },
        })

        // Create reverse stock log entry
        await tx.stockLog.create({
          data: {
            productId: item.productId,
            type: 'VOID',
            qty: item.qty, // positive qty because we're restoring
            note: `Voided order ${order.number}`,
          },
        })
      }
    }

    return updated
  })

  return NextResponse.json(updated)
}
