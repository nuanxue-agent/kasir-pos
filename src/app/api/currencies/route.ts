import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureCurrencyTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Currency (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    code         TEXT NOT NULL,
    name         TEXT NOT NULL,
    symbol       TEXT NOT NULL,
    exchangeRate REAL NOT NULL DEFAULT 1.0,
    isBase       INTEGER NOT NULL DEFAULT 0,
    active       INTEGER NOT NULL DEFAULT 1,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ExchangeRateHistory (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    fromCurrency TEXT NOT NULL,
    toCurrency   TEXT NOT NULL,
    rate         REAL NOT NULL,
    recordedAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCurrencyTables()

  const rows = await query(
    `SELECT * FROM Currency WHERE storeId = ? ORDER BY isBase DESC, code ASC`,
    [storeId],
  )
  const currencies = (rows as any[]).map(r => ({
    ...r,
    isBase: Boolean(r.isBase),
    active: Boolean(r.active),
  }))
  return NextResponse.json(currencies)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCurrencyTables()

  const b = (await req.json()) as any
  if (!b.code) return err("Field 'code' is required", 400, 'MISSING_FIELD')
  if (!b.name) return err("Field 'name' is required", 400, 'MISSING_FIELD')
  if (!b.symbol) return err("Field 'symbol' is required", 400, 'MISSING_FIELD')

  // Check for duplicate code in this store
  const existing = await query(
    `SELECT id FROM Currency WHERE storeId = ? AND code = ?`,
    [storeId, b.code.toUpperCase()],
  )
  if ((existing as any[]).length > 0) {
    return err(`Currency ${b.code} already exists`, 409, 'DUPLICATE')
  }

  const isBase = b.isBase ? 1 : 0
  const exchangeRate = isBase ? 1.0 : (b.exchangeRate ?? 1.0)

  // If setting as base, unset previous base
  if (isBase) {
    await exec(
      `UPDATE Currency SET isBase = 0, updatedAt = ? WHERE storeId = ? AND isBase = 1`,
      [nowISO(), storeId],
    )
  }

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO Currency (id, storeId, code, name, symbol, exchangeRate, isBase, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, storeId, b.code.toUpperCase(), b.name, b.symbol, exchangeRate, isBase, t, t],
  )

  // Record initial rate in history
  if (!isBase) {
    const baseCurrency = await query(
      `SELECT code FROM Currency WHERE storeId = ? AND isBase = 1`,
      [storeId],
    ) as any[]
    if (baseCurrency.length > 0) {
      await exec(
        `INSERT INTO ExchangeRateHistory (id, storeId, fromCurrency, toCurrency, rate, recordedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newId(), storeId, baseCurrency[0].code, b.code.toUpperCase(), exchangeRate, t],
      )
    }
  }

  return NextResponse.json({ id }, { status: 201 })
}
