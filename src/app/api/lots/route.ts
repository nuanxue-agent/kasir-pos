// GET /api/lots?storeId=&status=&productId=
// POST /api/lots?storeId=
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { deriveStatus } from '@/lib/lot-tracking'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureLotTable() {
  await exec(`CREATE TABLE IF NOT EXISTS Lot (
    id          TEXT PRIMARY KEY,
    storeId     TEXT NOT NULL,
    productId   TEXT NOT NULL,
    lotNumber   TEXT NOT NULL,
    expiryDate  TEXT NOT NULL,
    receivedDate TEXT NOT NULL,
    initialQty  REAL NOT NULL DEFAULT 0,
    remainingQty REAL NOT NULL DEFAULT 0,
    supplierId  TEXT,
    costPerUnit REAL NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'ACTIVE',
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

  const statusFilter  = req.nextUrl.searchParams.get('status')
  const productFilter = req.nextUrl.searchParams.get('productId')

  await ensureLotTable()

  const conditions: string[] = ['l.storeId = ?']
  const params: any[] = [storeId]

  if (statusFilter) {
    conditions.push('l.status = ?')
    params.push(statusFilter)
  }
  if (productFilter) {
    conditions.push('l.productId = ?')
    params.push(productFilter)
  }

  const rows = await query(`
    SELECT
      l.id, l.storeId, l.productId, l.lotNumber,
      l.expiryDate, l.receivedDate, l.initialQty, l.remainingQty,
      l.supplierId, l.costPerUnit, l.status,
      l.createdAt, l.updatedAt,
      p.name AS productName,
      s.name AS supplierName
    FROM Lot l
    LEFT JOIN Product p ON p.id = l.productId
    LEFT JOIN Supplier s ON s.id = l.supplierId
    WHERE ${conditions.join(' AND ')}
    ORDER BY l.expiryDate ASC, l.receivedDate ASC
  `, params)

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureLotTable()

  const b = (await req.json()) as any

  if (!b.productId)   return err("'productId' is required", 400, 'MISSING_FIELD')
  if (!b.lotNumber)   return err("'lotNumber' is required", 400, 'MISSING_FIELD')
  if (!b.expiryDate)  return err("'expiryDate' is required", 400, 'MISSING_FIELD')
  if (!b.receivedDate) return err("'receivedDate' is required", 400, 'MISSING_FIELD')
  if (b.initialQty === undefined || b.initialQty === null)
    return err("'initialQty' is required", 400, 'MISSING_FIELD')

  const initialQty = Number(b.initialQty)
  if (initialQty < 0) return err("'initialQty' must be non-negative", 400, 'INVALID_FIELD')

  const remainingQty = b.remainingQty !== undefined ? Number(b.remainingQty) : initialQty
  const costPerUnit  = Number(b.costPerUnit ?? 0)
  const status = deriveStatus({ remainingQty, expiryDate: b.expiryDate })

  const t  = nowISO()
  const id = newId()

  await exec(
    `INSERT INTO Lot (id, storeId, productId, lotNumber, expiryDate, receivedDate,
      initialQty, remainingQty, supplierId, costPerUnit, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, b.productId, b.lotNumber, b.expiryDate, b.receivedDate,
     initialQty, remainingQty, b.supplierId ?? null, costPerUnit, status, t, t]
  )

  return NextResponse.json({ id }, { status: 201 })
}
