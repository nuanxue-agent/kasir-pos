import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS GiftCard (
    id             TEXT PRIMARY KEY,
    storeId        TEXT NOT NULL,
    code           TEXT NOT NULL,
    initialBalance REAL NOT NULL DEFAULT 0,
    currentBalance REAL NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'ACTIVE',
    expiresAt      TEXT,
    issuedTo       TEXT,
    issuedAt       TEXT NOT NULL,
    createdAt      TEXT NOT NULL,
    updatedAt      TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS GiftCardTransaction (
    id        TEXT PRIMARY KEY,
    cardId    TEXT NOT NULL,
    storeId   TEXT NOT NULL,
    type      TEXT NOT NULL DEFAULT 'ISSUE',
    amount    REAL NOT NULL DEFAULT 0,
    balance   REAL NOT NULL DEFAULT 0,
    orderId   TEXT,
    createdAt TEXT NOT NULL
  )`)
}

/** Generate a readable gift card code: GC-XXXX-XXXX-XXXX */
export function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `GC-${seg()}-${seg()}-${seg()}`
}

// GET /api/gift-cards?storeId=&status=&search=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureTables()

    const conditions: string[] = ['storeId = ?']
    const params: any[] = [storeId]

    const status = url.searchParams.get('status')
    if (status) { conditions.push('status = ?'); params.push(status) }

    const search = url.searchParams.get('search')
    if (search) { conditions.push('(code LIKE ? OR issuedTo LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }

    const rows = await query(
      `SELECT * FROM GiftCard WHERE ${conditions.join(' AND ')} ORDER BY issuedAt DESC LIMIT 100`,
      params
    )
    return ok(rows)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/gift-cards?storeId=
// Body: { initialBalance, issuedTo?, expiresAt?, orderId? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureTables()

    const b = (await req.json()) as any
    if (!b.initialBalance || Number(b.initialBalance) <= 0) return err('initialBalance must be > 0')

    const t = nowISO()
    const id = newId()
    const code = generateCode()
    const amount = Number(b.initialBalance)

    await exec(
      `INSERT INTO GiftCard (id, storeId, code, initialBalance, currentBalance, status, expiresAt, issuedTo, issuedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
      [id, storeId, code, amount, amount, b.expiresAt ?? null, b.issuedTo ?? null, t, t, t]
    )

    // Record ISSUE transaction
    const txId = newId()
    await exec(
      `INSERT INTO GiftCardTransaction (id, cardId, storeId, type, amount, balance, orderId, createdAt)
       VALUES (?, ?, ?, 'ISSUE', ?, ?, ?, ?)`,
      [txId, id, storeId, amount, amount, b.orderId ?? null, t]
    )

    return ok({ id, code, initialBalance: amount, currentBalance: amount, status: 'ACTIVE' }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
