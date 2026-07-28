// GET /api/complaints?storeId=   POST /api/complaints
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS Complaint (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      customerId  TEXT,
      customerName TEXT,
      orderId     TEXT,
      category    TEXT NOT NULL DEFAULT 'OTHER',
      description TEXT NOT NULL,
      priority    TEXT NOT NULL DEFAULT 'MEDIUM',
      status      TEXT NOT NULL DEFAULT 'NEW',
      assignedTo  TEXT,
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL,
      resolvedAt  TEXT,
      resolution  TEXT
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const status = req.nextUrl.searchParams.get('status')
  const category = req.nextUrl.searchParams.get('category')
  const priority = req.nextUrl.searchParams.get('priority')

  let sql = 'SELECT * FROM Complaint WHERE storeId = ?'
  const params: any[] = [storeId]

  if (status) { sql += ' AND status = ?'; params.push(status) }
  if (category) { sql += ' AND category = ?'; params.push(category) }
  if (priority) { sql += ' AND priority = ?'; params.push(priority) }

  sql += ' ORDER BY createdAt DESC'

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as any
  if (!b.description?.trim()) return err("Field \'description\' is required", 400, 'MISSING_FIELD')

  const VALID_CATEGORIES = ['PRODUCT_QUALITY', 'SERVICE', 'DELIVERY', 'BILLING', 'OTHER']
  const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

  const category = b.category ?? 'OTHER'
  const priority = b.priority ?? 'MEDIUM'

  if (!VALID_CATEGORIES.includes(category)) return err('Invalid category', 400, 'INVALID_FIELD')
  if (!VALID_PRIORITIES.includes(priority)) return err('Invalid priority', 400, 'INVALID_FIELD')

  const t = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO Complaint
      (id, storeId, customerId, customerName, orderId, category, description, priority, status, assignedTo, createdAt, updatedAt, resolvedAt, resolution)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, NULL, NULL)`,
    [
      id, storeId,
      b.customerId ?? null,
      b.customerName ?? null,
      b.orderId ?? null,
      category,
      b.description.trim(),
      priority,
      b.assignedTo ?? null,
      t, t,
    ],
  )

  return NextResponse.json({ id, created: true }, { status: 201 })
}
