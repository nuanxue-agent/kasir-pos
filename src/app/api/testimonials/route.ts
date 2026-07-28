import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureTestimonialTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Testimonial (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    customerId   TEXT,
    customerName TEXT NOT NULL,
    content      TEXT NOT NULL,
    rating       REAL NOT NULL DEFAULT 5,
    source       TEXT NOT NULL DEFAULT 'IN_APP',
    status       TEXT NOT NULL DEFAULT 'PENDING',
    mediaUrl     TEXT,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTestimonialTables()

  const status = sp.get('status')
  const source = sp.get('source')

  let sql = `SELECT * FROM Testimonial WHERE storeId = ?`
  const params: any[] = [storeId]

  if (status) { sql += ` AND status = ?`; params.push(status) }
  if (source) { sql += ` AND source = ?`; params.push(source) }

  sql += ` ORDER BY createdAt DESC`

  const rows = (await query(sql, params)) as any[]
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTestimonialTables()

  const b = (await req.json()) as any
  if (!b.customerName) return err("Field 'customerName' is required", 400, 'MISSING_FIELD')
  if (!b.content) return err("Field 'content' is required", 400, 'MISSING_FIELD')

  const rating = Math.min(5, Math.max(1, Number(b.rating ?? 5)))
  const source = b.source ?? 'IN_APP'
  const validSources = ['IN_APP', 'GOOGLE', 'TOKOPEDIA', 'SHOPEE', 'MANUAL']
  if (!validSources.includes(source)) return err('Invalid source', 400, 'INVALID_FIELD')

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO Testimonial (id, storeId, customerId, customerName, content, rating, source, status, mediaUrl, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
    [id, storeId, b.customerId ?? null, b.customerName, b.content, rating, source, b.mediaUrl ?? null, t, t],
  )

  return NextResponse.json({ id }, { status: 201 })
}
