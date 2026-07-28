// GET/POST /api/queue-tokens
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS QueueToken (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    tokenNumber INTEGER NOT NULL,
    customerName TEXT,
    customerPhone TEXT,
    serviceType TEXT NOT NULL DEFAULT 'GENERAL',
    status TEXT NOT NULL DEFAULT 'WAITING',
    priority TEXT NOT NULL DEFAULT 'NORMAL',
    joinedAt TEXT NOT NULL,
    calledAt TEXT,
    completedAt TEXT
  )`)
}

// GET /api/queue-tokens?storeId=xxx&status=WAITING
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureTables()

    const status = url.searchParams.get('status')
    const date = url.searchParams.get('date') ?? nowISO().slice(0, 10)

    let sql = `SELECT * FROM QueueToken WHERE storeId = ? AND date(joinedAt) = ?`
    const params: unknown[] = [storeId, date]

    if (status) {
      sql += ` AND status = ?`
      params.push(status)
    }

    sql += ` ORDER BY priority DESC, tokenNumber ASC`

    const tokens = await query<Record<string, unknown>>(sql, params)
    return ok(tokens)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/queue-tokens?storeId=xxx
// Body: { customerName?, customerPhone?, serviceType?, priority? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureTables()

    const body = await req.json() as {
      customerName?: string
      customerPhone?: string
      serviceType?: string
      priority?: string
    }

    // Get next token number for today
    const today = nowISO().slice(0, 10)
    const lastRow = await query<Record<string, unknown>>(
      `SELECT MAX(tokenNumber) as maxNum FROM QueueToken WHERE storeId = ? AND date(joinedAt) = ?`,
      [storeId, today]
    )
    const lastNum = (lastRow[0]?.maxNum as number | null) ?? 0
    const tokenNumber = lastNum + 1

    const id = newId()
    const now = nowISO()
    const priority = ['NORMAL', 'HIGH'].includes(body.priority ?? '') ? body.priority! : 'NORMAL'
    const serviceType = body.serviceType?.trim() || 'GENERAL'

    await exec(
      `INSERT INTO QueueToken (id, storeId, tokenNumber, customerName, customerPhone, serviceType, status, priority, joinedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'WAITING', ?, ?)`,
      [id, storeId, tokenNumber, body.customerName?.trim() ?? null, body.customerPhone?.trim() ?? null, serviceType, priority, now]
    )

    return ok({ id, storeId, tokenNumber, customerName: body.customerName?.trim() ?? null, customerPhone: body.customerPhone?.trim() ?? null, serviceType, status: 'WAITING', priority, joinedAt: now, calledAt: null, completedAt: null }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
