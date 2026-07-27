import { getRequestContext } from '@cloudflare/next-on-pages'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export const runtime = 'edge'


// GET /api/inventory?storeId=xxx&lowStockOnly=true&page=1&q=search
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

  const { env } = getRequestContext()
  const db = env.DB as D1Database

  const offset = (page - 1) * limit

  let whereClauses = ['p.storeId = ?', 'p.active = 1', 'p.trackStock = 1']
  const params: any[] = [storeId]

  if (q) {
    whereClauses.push('(p.name LIKE ? OR p.sku LIKE ?)')
    params.push(`%${q}%`, `%${q}%`)
  }

  if (lowStockOnly) {
    whereClauses.push('p.stock <= p.lowStock')
  }

  const whereClause = whereClauses.join(' AND ')

  const [products, countRow] = await Promise.all([
    query<{
      id: string; storeId: string; categoryId: string | null
      name: string; sku: string | null; price: number; cost: number
      stock: number; lowStock: number; trackStock: number
      active: number; createdAt: string; updatedAt: string
      categoryName: string | null
    }>(db, `
      SELECT p.*, c.name as categoryName
      FROM Product p
      LEFT JOIN Category c ON p.categoryId = c.id
      WHERE ${whereClause}
      ORDER BY p.name ASC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]),
    queryOne<{ total: number }>(db, `
      SELECT COUNT(*) as total
      FROM Product p
      WHERE ${whereClause}
    `, params),
  ])

  const total = countRow?.total ?? 0

  return NextResponse.json({ products, total, page, pages: Math.ceil(total / limit) })
}
