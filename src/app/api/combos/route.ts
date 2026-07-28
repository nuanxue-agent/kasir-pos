// GET /api/combos?storeId=
// POST /api/combos?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureCombTables() {
  await exec(`CREATE TABLE IF NOT EXISTS Combo (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    basePrice     REAL NOT NULL DEFAULT 0,
    discountType  TEXT NOT NULL DEFAULT 'PERCENTAGE',
    discountValue REAL NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1,
    startDate     TEXT,
    endDate       TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ComboItem (
    id                 TEXT PRIMARY KEY,
    comboId            TEXT NOT NULL,
    storeId            TEXT NOT NULL,
    productId          TEXT NOT NULL,
    qty                INTEGER NOT NULL DEFAULT 1,
    isOptional         INTEGER NOT NULL DEFAULT 0,
    substituteGroupId  TEXT,
    createdAt          TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ComboSubstituteGroup (
    id        TEXT PRIMARY KEY,
    comboId   TEXT NOT NULL,
    storeId   TEXT NOT NULL,
    name      TEXT NOT NULL,
    minPick   INTEGER NOT NULL DEFAULT 1,
    maxPick   INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCombTables()

  const activeOnly = sp.get('active') === '1'
  const now = new Date().toISOString()

  const rows = (await query(
    `SELECT c.*,
            GROUP_CONCAT(
              ci.id||'~'||ci.productId||'~'||ci.qty||'~'||ci.isOptional||'~'||COALESCE(ci.substituteGroupId,'')
            ) AS itemsRaw
     FROM Combo c
     LEFT JOIN ComboItem ci ON ci.comboId = c.id
     WHERE c.storeId = ?
       ${activeOnly ? `AND c.active = 1 AND (c.startDate IS NULL OR c.startDate <= ?) AND (c.endDate IS NULL OR c.endDate >= date('now'))` : ''}
     GROUP BY c.id
     ORDER BY c.name ASC`,
    activeOnly ? [storeId, now] : [storeId],
  )) as any[]

  const combos = rows.map(row => {
    const items = row.itemsRaw
      ? row.itemsRaw.split(',').map((s: string) => {
          const [id, productId, qty, isOptional, substituteGroupId] = s.split('~')
          return {
            id,
            productId,
            qty: Number(qty),
            isOptional: isOptional === '1',
            substituteGroupId: substituteGroupId || null,
          }
        })
      : []
    const { itemsRaw, ...rest } = row
    return { ...rest, active: Boolean(rest.active), items }
  })

  return NextResponse.json(combos)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureCombTables()

  const b = (await req.json()) as any
  if (!b.name?.trim()) return err("Field 'name' is required", 400, 'MISSING_FIELD')
  if (b.basePrice === undefined || b.basePrice === null) return err("Field 'basePrice' is required", 400, 'MISSING_FIELD')
  if (!['PERCENTAGE', 'FIXED'].includes(b.discountType ?? 'PERCENTAGE')) {
    return err("discountType must be PERCENTAGE or FIXED", 400, 'INVALID_FIELD')
  }

  const t = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO Combo (id, storeId, name, description, basePrice, discountType, discountValue, active, startDate, endDate, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, storeId,
      b.name.trim(),
      b.description ?? null,
      Number(b.basePrice),
      b.discountType ?? 'PERCENTAGE',
      Number(b.discountValue ?? 0),
      b.active !== false ? 1 : 0,
      b.startDate ?? null,
      b.endDate ?? null,
      t, t,
    ],
  )

  return NextResponse.json({ id }, { status: 201 })
}
