import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { taxDueDate } from '@/components/accounting/TaxReportClient'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureTaxTables() {
  await exec(`CREATE TABLE IF NOT EXISTS TaxReport (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    type         TEXT NOT NULL,
    period       TEXT NOT NULL,
    totalTaxable REAL NOT NULL DEFAULT 0,
    taxAmount    REAL NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'DRAFT',
    filedAt      TEXT,
    dueDate      TEXT NOT NULL,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS TaxItem (
    id            TEXT PRIMARY KEY,
    reportId      TEXT NOT NULL,
    storeId       TEXT NOT NULL,
    reference     TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    taxableAmount REAL NOT NULL DEFAULT 0,
    taxRate       REAL NOT NULL DEFAULT 0,
    taxAmount     REAL NOT NULL DEFAULT 0,
    createdAt     TEXT NOT NULL
  )`)
}

const VALID_TYPES = ['PPH21', 'PPH23', 'PPN']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const type   = req.nextUrl.searchParams.get('type')
  const status = req.nextUrl.searchParams.get('status')

  await ensureTaxTables()

  let sql = `SELECT * FROM TaxReport WHERE storeId = ?`
  const params: any[] = [storeId]

  if (type) {
    if (!VALID_TYPES.includes(type)) return err('Invalid type', 400, 'INVALID_FIELD')
    sql += ` AND type = ?`
    params.push(type)
  }
  if (status) {
    sql += ` AND status = ?`
    params.push(status)
  }

  sql += ` ORDER BY period DESC, createdAt DESC`

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTaxTables()

  const b = (await req.json()) as any

  if (!b.type)   return err("Field 'type' is required", 400, 'MISSING_FIELD')
  if (!b.period) return err("Field 'period' is required", 400, 'MISSING_FIELD')

  if (!VALID_TYPES.includes(b.type)) {
    return err(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`, 400, 'INVALID_FIELD')
  }

  const periodRe = /^\d{4}-(0[1-9]|1[0-2])$/
  if (!periodRe.test(b.period)) {
    return err('period must be in YYYY-MM format', 400, 'INVALID_FIELD')
  }

  // Prevent duplicate (type + period) per store
  const existing = (await query(
    `SELECT id FROM TaxReport WHERE storeId = ? AND type = ? AND period = ?`,
    [storeId, b.type, b.period],
  )) as any[]
  if (existing.length > 0) {
    return err(`Laporan ${b.type} periode ${b.period} sudah ada`, 409, 'DUPLICATE')
  }

  const [year, month] = b.period.split('-').map(Number)
  const due = taxDueDate(b.type, year, month)

  const id  = newId()
  const now = nowISO()

  await exec(
    `INSERT INTO TaxReport (id, storeId, type, period, totalTaxable, taxAmount, status, filedAt, dueDate, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?)`,
    [id, storeId, b.type, b.period, 0, 0, due.toISOString(), now, now],
  )

  const created = (await query(`SELECT * FROM TaxReport WHERE id = ?`, [id])) as any[]
  return NextResponse.json(created[0], { status: 201 })
}
