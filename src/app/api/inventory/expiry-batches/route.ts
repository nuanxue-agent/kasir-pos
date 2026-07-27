import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

// Lazy-init the ExpiryBatch table
async function ensureTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS ExpiryBatch (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      productId   TEXT NOT NULL,
      batchNumber TEXT NOT NULL,
      expiryDate  TEXT NOT NULL,
      qty         REAL NOT NULL DEFAULT 0,
      costPerUnit REAL NOT NULL DEFAULT 0,
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL
    )
  `)
  await exec(`CREATE INDEX IF NOT EXISTS idx_expiry_batch_store ON ExpiryBatch(storeId)`)
  await exec(`CREATE INDEX IF NOT EXISTS idx_expiry_batch_product ON ExpiryBatch(storeId, productId)`)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  try {
    await ensureTable()
    const batches = await query<any>(
      `SELECT eb.*, p.name as productName
       FROM ExpiryBatch eb
       LEFT JOIN Product p ON p.id = eb.productId
       WHERE eb.storeId = ?
       ORDER BY eb.expiryDate ASC`,
      [storeId],
    )
    return NextResponse.json({ batches })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json() as Record<string, any>
    const { storeId, productId, batchNumber, expiryDate, qty, costPerUnit } = body

    if (!storeId || !productId || !batchNumber || !expiryDate || qty == null || costPerUnit == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (Number(qty) <= 0) {
      return NextResponse.json({ error: 'qty must be positive' }, { status: 400 })
    }
    if (Number(costPerUnit) < 0) {
      return NextResponse.json({ error: 'costPerUnit must be >= 0' }, { status: 400 })
    }

    await ensureTable()

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO ExpiryBatch (id, storeId, productId, batchNumber, expiryDate, qty, costPerUnit, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, productId, batchNumber, expiryDate, Number(qty), Number(costPerUnit), now, now],
    )

    return NextResponse.json({ id }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
