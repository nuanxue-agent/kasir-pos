import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { generateFakturNumber, calcPPN } from '@/lib/e-faktur'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureEFakturTables() {
  await exec(`CREATE TABLE IF NOT EXISTS EFaktur (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    invoiceNumber TEXT NOT NULL,
    fakturCode   TEXT NOT NULL,
    buyerNpwp    TEXT NOT NULL DEFAULT '',
    buyerName    TEXT NOT NULL DEFAULT '',
    taxBase      REAL NOT NULL DEFAULT 0,
    taxAmount    REAL NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'DRAFT',
    uploadedAt   TEXT,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS FakturSeries (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    prefix      TEXT NOT NULL DEFAULT '010.000',
    lastNumber  INTEGER NOT NULL DEFAULT 0,
    year        INTEGER NOT NULL,
    month       INTEGER NOT NULL,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const status = req.nextUrl.searchParams.get('status')

  await ensureEFakturTables()

  let sql = `SELECT * FROM EFaktur WHERE storeId = ?`
  const params: any[] = [storeId]
  if (status) {
    sql += ` AND status = ?`
    params.push(status)
  }
  sql += ` ORDER BY createdAt DESC`

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureEFakturTables()

  const b = (await req.json()) as any

  if (!b.invoiceNumber) return err("Field 'invoiceNumber' is required", 400, 'MISSING_FIELD')
  if (!b.buyerName) return err("Field 'buyerName' is required", 400, 'MISSING_FIELD')
  if (b.taxBase === undefined || b.taxBase === null)
    return err("Field 'taxBase' is required", 400, 'MISSING_FIELD')

  // Get or create series for current period
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const seriesRows = await query(
    `SELECT * FROM FakturSeries WHERE storeId = ? AND year = ? AND month = ? LIMIT 1`,
    [storeId, year, month],
  )

  let series = (seriesRows as any[])[0]
  const t = nowISO()

  if (!series) {
    const sid = newId()
    await exec(
      `INSERT INTO FakturSeries (id, storeId, prefix, lastNumber, year, month, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sid, storeId, b.prefix ?? '010.000', 0, year, month, t, t],
    )
    series = { id: sid, storeId, prefix: b.prefix ?? '010.000', lastNumber: 0, year, month }
  }

  const nextNum = series.lastNumber + 1
  const [txCode, statusCode] = (series.prefix as string).split('.')
  const fakturCode = generateFakturNumber(nextNum, year, txCode, statusCode)

  // Update series
  await exec(`UPDATE FakturSeries SET lastNumber = ?, updatedAt = ? WHERE id = ?`, [
    nextNum,
    t,
    series.id,
  ])

  const taxBase = Number(b.taxBase)
  const taxAmount = b.taxAmount !== undefined ? Number(b.taxAmount) : calcPPN(taxBase)

  const id = newId()
  await exec(
    `INSERT INTO EFaktur (id, storeId, invoiceNumber, fakturCode, buyerNpwp, buyerName, taxBase, taxAmount, status, uploadedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      b.invoiceNumber,
      fakturCode,
      b.buyerNpwp ?? '',
      b.buyerName,
      taxBase,
      taxAmount,
      'DRAFT',
      null,
      t,
      t,
    ],
  )

  return NextResponse.json({ id, fakturCode }, { status: 201 })
}
