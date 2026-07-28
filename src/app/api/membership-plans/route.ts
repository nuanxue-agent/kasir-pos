// GET /api/membership-plans?storeId=
// POST /api/membership-plans
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS MembershipPlan (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    name          TEXT NOT NULL,
    price         REAL NOT NULL DEFAULT 0,
    billingCycle  TEXT NOT NULL DEFAULT 'MONTHLY',
    durationDays  INTEGER NOT NULL DEFAULT 30,
    description   TEXT,
    benefits      TEXT,
    active        INTEGER NOT NULL DEFAULT 1,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureTables()
  const rows = await query<any>(
    `SELECT * FROM MembershipPlan WHERE storeId=? AND active=1 ORDER BY price ASC`,
    [storeId],
  )
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureTables()

  const b = (await req.json()) as any
  if (!b.name || b.name === '') return err("Field 'name' is required", 400)
  if (b.price === undefined || b.price === null || b.price === '')
    return err("Field 'price' is required", 400)
  const price = Number(b.price)
  if (isNaN(price) || price <= 0) return err("'price' must be a positive number", 400)

  const cycles = ['MONTHLY', 'QUARTERLY', 'ANNUAL']
  if (b.billingCycle && !cycles.includes(b.billingCycle))
    return err('billingCycle must be MONTHLY, QUARTERLY, or ANNUAL')

  const t = nowISO()
  const id = newId()
  const durationMap: Record<string, number> = { MONTHLY: 30, QUARTERLY: 90, ANNUAL: 365 }
  const cycle = b.billingCycle ?? 'MONTHLY'
  await exec(
    `INSERT INTO MembershipPlan
     (id,storeId,name,price,billingCycle,durationDays,description,benefits,active,createdAt,updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      storeId,
      b.name,
      price,
      cycle,
      Number(b.durationDays) || durationMap[cycle] || 30,
      b.description ?? null,
      b.benefits ? JSON.stringify(b.benefits) : null,
      1,
      t,
      t,
    ],
  )
  return NextResponse.json({ id }, { status: 201 })
}
