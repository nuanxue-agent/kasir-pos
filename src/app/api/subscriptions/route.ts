// GET /api/subscriptions?storeId=&status=&customerId=
// POST /api/subscriptions
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureSubscriptionTables() {
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
  await exec(`CREATE TABLE IF NOT EXISTS CustomerSubscription (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    customerId    TEXT NOT NULL,
    planId        TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'ACTIVE',
    startDate     TEXT NOT NULL,
    nextBillingAt TEXT NOT NULL,
    endDate       TEXT,
    cancelledAt   TEXT,
    autoRenew     INTEGER NOT NULL DEFAULT 1,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureSubscriptionTables()

  const status = sp.get('status')
  const customerId = sp.get('customerId')
  let q = `SELECT cs.*, c.name as customerName, c.phone as customerPhone,
                  mp.name as planName, mp.price as planPrice, mp.billingCycle
           FROM CustomerSubscription cs
           JOIN Customer c ON cs.customerId = c.id
           JOIN MembershipPlan mp ON cs.planId = mp.id
           WHERE cs.storeId=?`
  const p: any[] = [storeId]
  if (status) {
    q += ` AND cs.status=?`
    p.push(status)
  }
  if (customerId) {
    q += ` AND cs.customerId=?`
    p.push(customerId)
  }
  q += ` ORDER BY cs.createdAt DESC`

  return NextResponse.json(await query(q, p))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  await ensureSubscriptionTables()

  const b = (await req.json()) as any
  if (!b.customerId) return err("Field 'customerId' is required", 400)
  if (!b.planId) return err("Field 'planId' is required", 400)

  const plan = await queryOne<any>(`SELECT * FROM MembershipPlan WHERE id=? AND storeId=?`, [
    b.planId,
    storeId,
  ])
  if (!plan) return err('Membership plan not found', 404)

  const startDate = b.startDate ?? new Date().toISOString().slice(0, 10)
  const nextBillingAt = (() => {
    const d = new Date(startDate)
    if (plan.billingCycle === 'MONTHLY') d.setMonth(d.getMonth() + 1)
    else if (plan.billingCycle === 'QUARTERLY') d.setMonth(d.getMonth() + 3)
    else if (plan.billingCycle === 'ANNUAL') d.setFullYear(d.getFullYear() + 1)
    else d.setDate(d.getDate() + (plan.durationDays ?? 30))
    return d.toISOString().slice(0, 10)
  })()

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO CustomerSubscription
     (id,storeId,customerId,planId,status,startDate,nextBillingAt,autoRenew,createdAt,updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      storeId,
      b.customerId,
      b.planId,
      b.status ?? 'ACTIVE',
      startDate,
      nextBillingAt,
      b.autoRenew !== false ? 1 : 0,
      t,
      t,
    ],
  )
  return NextResponse.json({ id, nextBillingAt }, { status: 201 })
}
