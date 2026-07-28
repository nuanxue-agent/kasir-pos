// GET/POST /api/petty-cash — fund management
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensurePettyCashTables() {
  await exec(`CREATE TABLE IF NOT EXISTS PettyCashFund (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    name        TEXT NOT NULL,
    balance     REAL NOT NULL DEFAULT 0,
    maxBalance  REAL NOT NULL DEFAULT 1000000,
    custodian   TEXT NOT NULL DEFAULT '',
    active      INTEGER NOT NULL DEFAULT 1,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS PettyCashTransaction (
    id            TEXT PRIMARY KEY,
    fundId        TEXT NOT NULL,
    storeId       TEXT NOT NULL,
    type          TEXT NOT NULL DEFAULT 'EXPENSE',
    amount        REAL NOT NULL DEFAULT 0,
    category      TEXT NOT NULL DEFAULT 'Umum',
    description   TEXT NOT NULL DEFAULT '',
    receiptNumber TEXT NOT NULL DEFAULT '',
    createdBy     TEXT NOT NULL DEFAULT '',
    createdAt     TEXT NOT NULL
  )`)
}

// GET /api/petty-cash?storeId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensurePettyCashTables()

    const rows = await query(
      `SELECT * FROM PettyCashFund WHERE storeId = ? ORDER BY createdAt DESC`,
      [storeId],
    )

    const funds = (rows as any[]).map(r => ({
      ...r,
      active: Boolean(r.active),
      balance: Number(r.balance),
      maxBalance: Number(r.maxBalance),
    }))

    return ok(funds)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

// POST /api/petty-cash?storeId=xxx
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensurePettyCashTables()

    const b = (await req.json()) as any
    if (!b.name) return err("Field 'name' is required")
    if (!b.custodian) return err("Field 'custodian' is required")

    const t = nowISO()
    const id = newId()
    const maxBalance = Number(b.maxBalance ?? 1000000)
    const initialBalance = Number(b.balance ?? 0)

    await exec(
      `INSERT INTO PettyCashFund (id, storeId, name, balance, maxBalance, custodian, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, storeId, b.name, initialBalance, maxBalance, b.custodian, t, t],
    )

    return ok({ id }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
