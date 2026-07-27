import { getRequestContext } from '@cloudflare/next-on-pages'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, exec, newId, toSQLiteDate } from '@/lib/db'

export const runtime = 'edge'


// GET /api/discounts?storeId=xxx
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeId = new URL(req.url).searchParams.get('storeId')
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const { env } = getRequestContext()
  const db = env.DB

  const discounts = await query(db,
    `SELECT * FROM Discount WHERE storeId = ? ORDER BY createdAt DESC`,
    [storeId]
  )

  return NextResponse.json(discounts)
}

const createSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  code: z.string().optional(),
  type: z.enum(['PERCENTAGE', 'FIXED']),
  value: z.number().positive(),
  minOrder: z.number().min(0).default(0),
  maxUses: z.number().int().positive().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  active: z.boolean().default(true),
})

// POST /api/discounts
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { env } = getRequestContext()
  const db = env.DB

  const d = parsed.data
  const id = newId()
  const now = toSQLiteDate(new Date())
  const startsAt = d.startsAt ? toSQLiteDate(d.startsAt) : null
  const endsAt = d.endsAt ? toSQLiteDate(d.endsAt) : null

  await exec(db, `
    INSERT INTO Discount (id, storeId, name, code, type, value, minOrder, maxUses, startsAt, endsAt, active, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, d.storeId, d.name, d.code ?? null, d.type, d.value, d.minOrder, d.maxUses ?? null, startsAt, endsAt, d.active ? 1 : 0, now, now])

  const discount = await queryOne(db, `SELECT * FROM Discount WHERE id = ?`, [id])
  return NextResponse.json(discount, { status: 201 })
}
