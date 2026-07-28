import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'
import { calcOverallScore, validateScores } from '@/lib/vendor-evaluation'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function ensureVendorEvaluationTable() {
  await exec(`CREATE TABLE IF NOT EXISTS VendorEvaluation (
    id                 TEXT PRIMARY KEY,
    storeId            TEXT NOT NULL,
    vendorId           TEXT NOT NULL,
    orderId            TEXT,
    deliveryScore      REAL NOT NULL,
    qualityScore       REAL NOT NULL,
    priceScore         REAL NOT NULL,
    communicationScore REAL NOT NULL,
    overallScore       REAL NOT NULL,
    notes              TEXT,
    evaluatedAt        TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const vendorId = sp.get('vendorId')

  await ensureVendorEvaluationTable()

  let sql = `
    SELECT ve.*, v.name as vendorName
    FROM VendorEvaluation ve
    LEFT JOIN Vendor v ON ve.vendorId = v.id
    WHERE ve.storeId = ?
  `
  const params: any[] = [storeId]

  if (vendorId) {
    sql += ` AND ve.vendorId = ?`
    params.push(vendorId)
  }

  sql += ` ORDER BY ve.evaluatedAt DESC`

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureVendorEvaluationTable()

  const b = (await req.json()) as any
  if (!b.vendorId) return err("Field 'vendorId' is required", 400, 'MISSING_FIELD')

  const delivery = Number(b.deliveryScore)
  const quality = Number(b.qualityScore)
  const price = Number(b.priceScore)
  const communication = Number(b.communicationScore)

  const validation = validateScores(delivery, quality, price, communication)
  if (!validation.valid) return err(validation.error ?? 'Invalid scores', 400, 'INVALID_FIELD')

  const overall = calcOverallScore(delivery, quality, price, communication)
  const id = newId()
  const now = nowISO()

  await exec(
    `INSERT INTO VendorEvaluation
      (id, storeId, vendorId, orderId, deliveryScore, qualityScore, priceScore, communicationScore, overallScore, notes, evaluatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      b.vendorId,
      b.orderId ?? null,
      delivery,
      quality,
      price,
      communication,
      overall,
      b.notes ?? null,
      now,
    ]
  )

  return NextResponse.json({ id, overallScore: overall }, { status: 201 })
}
