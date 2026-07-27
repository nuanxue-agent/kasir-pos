import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// GET /api/products?storeId=xxx&categoryId=xxx&q=xxx&page=1
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  const categoryId = searchParams.get('categoryId')
  const q = searchParams.get('q')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '50')

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const where = {
    storeId,
    active: true,
    ...(categoryId ? { categoryId } : {}),
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true, variants: { where: { active: true } } },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ])

  return NextResponse.json({ products, total, page, pages: Math.ceil(total / limit) })
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
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data

  const product = await prisma.product.create({
    data: {
      ...data,
      ...(data.stock > 0 ? {
        stockLogs: {
          create: { type: 'INITIAL', qty: data.stock, note: 'Initial stock' },
        },
      } : {}),
    },
    include: { category: true },
  })

  return NextResponse.json(product, { status: 201 })
}
