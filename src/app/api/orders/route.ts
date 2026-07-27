import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

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

  const where = {
    storeId,
    ...(status ? { status: status as any } : {}),
    ...(dateFrom || dateTo ? {
      createdAt: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      },
    } : {}),
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: { include: { product: true } },
        payments: true,
        customer: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ])

  return NextResponse.json({ orders, total, page, pages: Math.ceil(total / limit) })
}

// POST /api/orders -- create a new order (checkout)
const checkoutSchema = z.object({
  storeId: z.string(),
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
  })),
  payments: z.array(z.object({
    method: z.enum(['CASH', 'CARD', 'TRANSFER', 'QRIS', 'OTHER']),
    amount: z.number().positive(),
    reference: z.string().optional(),
    change: z.number().min(0).default(0),
  })),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = checkoutSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data

  // Get store for tax rate
  const store = await prisma.store.findUnique({ where: { id: data.storeId } })
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  // Get last order number
  const lastOrder = await prisma.order.findFirst({
    where: { storeId: data.storeId },
    orderBy: { createdAt: 'desc' },
    select: { number: true },
  })
  const lastNum = lastOrder ? parseInt(lastOrder.number.replace('INV-', '')) : 0
  const orderNumber = `INV-${String(lastNum + 1).padStart(4, '0')}`

  // Calculate totals
  const items = data.items.map(item => ({
    ...item,
    subtotal: item.qty * (item.price - item.discount),
  }))
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0)

  // Apply discount
  let discountAmt = 0
  if (data.discountId) {
    const discount = await prisma.discount.findUnique({ where: { id: data.discountId } })
    if (discount) {
      discountAmt = discount.type === 'PERCENTAGE'
        ? Math.round(subtotal * discount.value / 100)
        : discount.value
    }
  }

  const taxableAmt = subtotal - discountAmt
  const taxAmt = Math.round(taxableAmt * store.taxRate)
  const total = taxableAmt + taxAmt

  // Create order in transaction
  const order = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        storeId: data.storeId,
        number: orderNumber,
        status: 'PAID',
        userId: session.user.id,
        customerId: data.customerId,
        discountId: data.discountId,
        note: data.note,
        subtotal,
        discountAmt,
        taxAmt,
        total,
        items: {
          create: items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            name: item.name,
            variantName: item.variantName,
            price: item.price,
            qty: item.qty,
            discount: item.discount,
            subtotal: item.subtotal,
          })),
        },
        payments: {
          create: data.payments,
        },
      },
      include: { items: true, payments: true },
    })

    // Deduct stock
    for (const item of items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } })
      if (product?.trackStock) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.qty } },
        })
        await tx.stockLog.create({
          data: {
            productId: item.productId,
            type: 'SALE',
            qty: -item.qty,
            note: `Order ${orderNumber}`,
          },
        })
      }
    }

    // Update discount usage
    if (data.discountId) {
      await tx.discount.update({
        where: { id: data.discountId },
        data: { usedCount: { increment: 1 } },
      })
    }

    return order
  })

  return NextResponse.json(order, { status: 201 })
}
