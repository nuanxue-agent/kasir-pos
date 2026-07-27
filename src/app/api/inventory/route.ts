import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/inventory?storeId=xxx&lowStockOnly=true&page=1
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  const lowStockOnly = searchParams.get('lowStockOnly') === 'true'
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '50')
  const q = searchParams.get('q')

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const where = {
    storeId,
    active: true,
    trackStock: true,
    ...(lowStockOnly ? {
      OR: [
        { stock: { lte: prisma.product.fields.lowStock } },
        { stock: 0 },
      ],
    } : {}),
    ...(q ? {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { sku: { contains: q, mode: 'insensitive' as const } },
      ],
    } : {}),
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ])

  return NextResponse.json({ products, total, page, pages: Math.ceil(total / limit) })
}
