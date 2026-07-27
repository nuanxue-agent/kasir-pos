import { getRequestContext } from '@cloudflare/next-on-pages'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, exec, newId, toSQLiteDate } from '@/lib/db'

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
  const offset = (page - 1) * limit

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const { env } = getRequestContext()
  const db = env.DB

  const search = q ? `%${q}%` : '%'

  const [customers, countRow] = await Promise.all([
    query<{
      id: string; storeId: string; name: string; phone: string | null
      email: string | null; address: string | null; points: number
      createdAt: string; updatedAt: string
      totalOrders: number; totalSpent: number
    }>(db, `
      SELECT
        c.*,
        COUNT(DISTINCT o.id) as totalOrders,
        COALESCE(SUM(CASE WHEN o.status = 'PAID' THEN o.total ELSE 0 END), 0) as totalSpent
      FROM Customer c
      LEFT JOIN \`Order\` o ON o.customerId = c.id
      WHERE c.storeId = ?
        AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)
      GROUP BY c.id
      ORDER BY c.createdAt DESC
      LIMIT ? OFFSET ?
    `, [storeId, search, search, search, limit, offset]),
    queryOne<{ total: number }>(db, `
      SELECT COUNT(*) as total FROM Customer
      WHERE storeId = ?
        AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)
    `, [storeId, search, search, search]),
  ])

  const total = countRow?.total ?? 0

  return NextResponse.json({ customers, total, page, pages: Math.ceil(total / limit) })
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

  const { env } = getRequestContext()
  const db = env.DB

  const { storeId, name, phone, email, address } = parsed.data
  const id = newId()
  const now = toSQLiteDate(new Date())

  try {
    await exec(db,
      `INSERT INTO Customer (id, storeId, name, phone, email, address, points, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, storeId, name, phone ?? null, email || null, address ?? null, now, now]
    )
    const customer = await queryOne(db, `SELECT * FROM Customer WHERE id = ?`, [id])
    return NextResponse.json(customer, { status: 201 })
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE')) {
      return NextResponse.json(
        { error: 'A customer with that phone or email already exists' },
        { status: 409 }
      )
    }
    throw err
  }
}
