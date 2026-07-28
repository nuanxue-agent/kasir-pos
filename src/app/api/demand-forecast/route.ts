import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureForecastTables() {
  await exec(`CREATE TABLE IF NOT EXISTS ForecastModel (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    productId     TEXT NOT NULL,
    method        TEXT NOT NULL DEFAULT 'MOVING_AVG',
    windowDays    INTEGER NOT NULL DEFAULT 7,
    alpha         REAL NOT NULL DEFAULT 0.3,
    lastTrainedAt TEXT,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ForecastResult (
    id             TEXT PRIMARY KEY,
    modelId        TEXT NOT NULL,
    storeId        TEXT NOT NULL,
    productId      TEXT NOT NULL,
    forecastDate   TEXT NOT NULL,
    predictedQty   REAL NOT NULL DEFAULT 0,
    confidenceLow  REAL NOT NULL DEFAULT 0,
    confidenceHigh REAL NOT NULL DEFAULT 0,
    actualQty      REAL,
    createdAt      TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureForecastTables()

  const rows = await query(
    `SELECT fm.*, p.name as productName
     FROM ForecastModel fm
     LEFT JOIN Product p ON fm.productId = p.id
     WHERE fm.storeId = ?
     ORDER BY fm.createdAt DESC`,
    [storeId]
  )
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureForecastTables()

  const b = (await req.json()) as any
  if (!b.productId) return err("Field 'productId' is required", 400, 'MISSING_FIELD')

  const validMethods = ['MOVING_AVG', 'EXPONENTIAL', 'LINEAR_TREND']
  const method: string = b.method ?? 'MOVING_AVG'
  if (!validMethods.includes(method)) return err('Invalid method', 400, 'INVALID_FIELD')

  const windowDays = Number(b.windowDays ?? 7)
  const alpha = Number(b.alpha ?? 0.3)
  if (alpha <= 0 || alpha >= 1) return err('alpha must be between 0 and 1', 400, 'INVALID_FIELD')

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO ForecastModel (id, storeId, productId, method, windowDays, alpha, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, b.productId, method, windowDays, alpha, t, t]
  )
  return NextResponse.json({ id }, { status: 201 })
}
