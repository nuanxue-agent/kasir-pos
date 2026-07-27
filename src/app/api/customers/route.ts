import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'edge'


// GET /api/customers?storeId=xxx&q=xxx&page=1&limit=20
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  const q = searchParams.get('q')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '20')

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const where = {
    storeId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { phone: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        _count: { select: { orders: true } },
        orders: {
          select: { total: true },
          where: { status: 'PAID' },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ])

  // Flatten aggregates
  const result = customers.map((c) => ({
    id: c.id,
    storeId: c.storeId,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    points: c.points,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    totalOrders: c._count.orders,
    totalSpent: c.orders.reduce((sum, o) => sum + o.total, 0),
  }))

  return NextResponse.json({ customers: result, total, page, pages: Math.ceil(total / limit) })
}

// POST /api/customers
const createSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data

  try {
    const customer = await prisma.customer.create({
      data: {
        storeId: data.storeId,
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
      },
    })
    return NextResponse.json(customer, { status: 201 })
  } catch (err: any) {
    if (err.code === 'P2002') {
      return NextResponse.json(
        { error: 'A customer with that phone or email already exists' },
        { status: 409 }
      )
    }
    throw err
  }
}
