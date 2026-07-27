import { getRequestContext } from '@cloudflare/next-on-pages'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, exec, batch, newId, toSQLiteDate } from '@/lib/db'
import * as bcrypt from 'bcryptjs'

export const runtime = 'edge'


// GET /api/staff?storeId=xxx
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeId = new URL(req.url).searchParams.get('storeId')
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const { env } = getRequestContext()
  const db = env.DB as D1Database

  const staff = await query(db, `
    SELECT
      u.id, u.name, u.email, u.role, u.active, u.createdAt,
      su.role as storeRole, su.storeId
    FROM User u
    JOIN StoreUser su ON u.id = su.userId
    WHERE su.storeId = ?
    ORDER BY u.name ASC
  `, [storeId])

  return NextResponse.json(staff)
}

const createSchema = z.object({
  storeId: z.string(),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  pin: z.string().length(4).optional(),
  role: z.enum(['OWNER', 'MANAGER', 'CASHIER']),
})

// POST /api/staff
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { storeId, name, email, password, pin, role } = parsed.data

  const { env } = getRequestContext()
  const db = env.DB as D1Database

  // Check store exists and get tenantId
  const store = await queryOne<{ id: string; tenantId: string }>(db,
    `SELECT id, tenantId FROM Store WHERE id = ?`, [storeId]
  )
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  // Check email uniqueness
  const existing = await queryOne(db, `SELECT id FROM User WHERE email = ?`, [email])
  if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 400 })

  const hashedPassword = await bcrypt.hash(password, 12)
  const hashedPin = pin ? await bcrypt.hash(pin, 10) : null

  const userId = newId()
  const suId = newId()
  const now = toSQLiteDate(new Date())

  await batch(db, [
    {
      sql: `INSERT INTO User (id, name, email, password, pin, role, tenantId, active, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      params: [userId, name, email, hashedPassword, hashedPin, role, store.tenantId, now, now],
    },
    {
      sql: `INSERT INTO StoreUser (id, userId, storeId, role, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [suId, userId, storeId, role, now, now],
    },
  ])

  return NextResponse.json({ id: userId, name, email, role }, { status: 201 })
}
