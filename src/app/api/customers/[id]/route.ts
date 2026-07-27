import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'edge'


// GET /api/customers/:id — single customer + last 10 orders
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          items: { select: { name: true, qty: true, price: true, subtotal: true } },
          payments: { select: { method: true, amount: true } },
        },
      },
      _count: { select: { orders: true } },
    },
  })

  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const totalSpent = await prisma.order.aggregate({
    where: { customerId: id, status: 'PAID' },
    _sum: { total: true },
  })

  return NextResponse.json({
    ...customer,
    totalOrders: customer._count.orders,
    totalSpent: totalSpent._sum.total ?? 0,
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

  try {
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...parsed.data,
        email: parsed.data.email || null,
      },
    })
    return NextResponse.json(customer)
  } catch (err: any) {
    if (err.code === 'P2025') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (err.code === 'P2002') {
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

  const orderCount = await prisma.order.count({ where: { customerId: id } })
  if (orderCount > 0) {
    return NextResponse.json(
      { error: 'Cannot delete a customer with existing orders' },
      { status: 409 }
    )
  }

  try {
    await prisma.customer.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err.code === 'P2025') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    throw err
  }
}
