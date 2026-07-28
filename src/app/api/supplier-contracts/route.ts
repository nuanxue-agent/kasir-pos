import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureSupplierContractTables() {
  await exec(`CREATE TABLE IF NOT EXISTS SupplierContract (
    id             TEXT PRIMARY KEY,
    storeId        TEXT NOT NULL,
    vendorId       TEXT NOT NULL,
    contractNumber TEXT NOT NULL,
    startDate      TEXT NOT NULL,
    endDate        TEXT NOT NULL,
    paymentTerms   TEXT NOT NULL DEFAULT 'NET30',
    status         TEXT NOT NULL DEFAULT 'DRAFT',
    notes          TEXT,
    createdAt      TEXT NOT NULL,
    updatedAt      TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ContractPriceLine (
    id           TEXT PRIMARY KEY,
    contractId   TEXT NOT NULL,
    storeId      TEXT NOT NULL,
    productId    TEXT NOT NULL,
    unitPrice    REAL NOT NULL DEFAULT 0,
    minOrderQty  REAL NOT NULL DEFAULT 1,
    validFrom    TEXT NOT NULL,
    validTo      TEXT NOT NULL,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const status = req.nextUrl.searchParams.get('status')
  const vendorId = req.nextUrl.searchParams.get('vendorId')

  await ensureSupplierContractTables()

  let sql = `
    SELECT sc.*, v.name as vendorName
    FROM SupplierContract sc
    LEFT JOIN Vendor v ON sc.vendorId = v.id
    WHERE sc.storeId = ?
  `
  const params: any[] = [storeId]

  if (status) { sql += ` AND sc.status = ?`; params.push(status) }
  if (vendorId) { sql += ` AND sc.vendorId = ?`; params.push(vendorId) }
  sql += ` ORDER BY sc.createdAt DESC`

  const rows = await query(sql, params).catch(() => [])
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureSupplierContractTables()

  const b = (await req.json()) as any
  if (!b.vendorId) return err("Field 'vendorId' is required", 400, 'MISSING_FIELD')
  if (!b.contractNumber) return err("Field 'contractNumber' is required", 400, 'MISSING_FIELD')
  if (!b.startDate) return err("Field 'startDate' is required", 400, 'MISSING_FIELD')
  if (!b.endDate) return err("Field 'endDate' is required", 400, 'MISSING_FIELD')

  const validStatuses = ['ACTIVE', 'EXPIRED', 'DRAFT', 'TERMINATED']
  const status = b.status ?? 'DRAFT'
  if (!validStatuses.includes(status)) return err('Invalid status', 400, 'INVALID_FIELD')

  // Check duplicate contract number for store
  const existing = await query(
    `SELECT id FROM SupplierContract WHERE storeId = ? AND contractNumber = ?`,
    [storeId, b.contractNumber],
  ) as any[]
  if (existing.length > 0) return err('Contract number already exists', 409, 'DUPLICATE')

  const t = nowISO()
  const id = newId()
  await exec(
    `INSERT INTO SupplierContract (id, storeId, vendorId, contractNumber, startDate, endDate, paymentTerms, status, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, b.vendorId, b.contractNumber, b.startDate, b.endDate,
     b.paymentTerms ?? 'NET30', status, b.notes ?? null, t, t],
  )
  return NextResponse.json({ id }, { status: 201 })
}
