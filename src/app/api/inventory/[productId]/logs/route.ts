import { getRequestContext } from '@cloudflare/next-on-pages'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export const runtime = 'edge'


// GET /api/inventory/:productId/logs?page=1
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { productId } = await params
  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '20')
  const offset = (page - 1) * limit

  const { env } = getRequestContext()
  const db = env.DB

  const [logs, countRow] = await Promise.all([
    query(db, `
      SELECT * FROM StockLog
      WHERE productId = ?
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `, [productId, limit, offset]),
    queryOne<{ total: number }>(db,
      `SELECT COUNT(*) as total FROM StockLog WHERE productId = ?`,
      [productId]
    ),
  ])

  const total = countRow?.total ?? 0

  return NextResponse.json({ logs, total, page, pages: Math.ceil(total / limit) })
}
