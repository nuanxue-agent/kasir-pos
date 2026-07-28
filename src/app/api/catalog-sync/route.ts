// GET  /api/catalog-sync?storeId=
// POST /api/catalog-sync  — create a sync mapping
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, queryOne, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_SOURCES = ['TOKOPEDIA', 'SHOPEE', 'MANUAL'] as const
type ExternalSource = (typeof VALID_SOURCES)[number]

async function ensureTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS CatalogSync (
      id             TEXT PRIMARY KEY,
      storeId        TEXT NOT NULL,
      externalSource TEXT NOT NULL DEFAULT 'MANUAL',
      externalId     TEXT NOT NULL,
      productId      TEXT NOT NULL,
      lastSyncAt     TEXT,
      active         INTEGER NOT NULL DEFAULT 1,
      createdAt      TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const source = sp.get('source')
  let rows: any[]
  if (source) {
    rows = await query(
      `SELECT cs.*, p.name AS productName, p.sku AS productSku
       FROM CatalogSync cs
       LEFT JOIN Product p ON p.id = cs.productId
       WHERE cs.storeId = ? AND cs.externalSource = ?
       ORDER BY cs.createdAt DESC`,
      [storeId, source],
    )
  } else {
    rows = await query(
      `SELECT cs.*, p.name AS productName, p.sku AS productSku
       FROM CatalogSync cs
       LEFT JOIN Product p ON p.id = cs.productId
       WHERE cs.storeId = ?
       ORDER BY cs.createdAt DESC`,
      [storeId],
    )
  }

  return NextResponse.json(
    (rows as any[]).map(r => ({ ...r, active: Boolean(r.active) })),
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTables()

  const b = (await req.json()) as any

  if (!b.externalId) return err("Field 'externalId' is required", 400, 'MISSING_FIELD')
  if (!b.productId) return err("Field 'productId' is required", 400, 'MISSING_FIELD')
  if (!b.externalSource) return err("Field 'externalSource' is required", 400, 'MISSING_FIELD')
  if (!VALID_SOURCES.includes(b.externalSource as ExternalSource)) {
    return err(
      `Invalid externalSource. Must be one of: ${VALID_SOURCES.join(', ')}`,
      400,
      'INVALID_VALUE',
    )
  }

  // Check if product exists in store
  const product = await queryOne(`SELECT id FROM Product WHERE id = ? AND storeId = ?`, [
    b.productId,
    storeId,
  ])
  if (!product) return err('Product not found', 404, 'NOT_FOUND')

  // Check duplicate mapping
  const existing = await queryOne(
    `SELECT id FROM CatalogSync WHERE storeId = ? AND externalSource = ? AND externalId = ?`,
    [storeId, b.externalSource, b.externalId],
  )
  if (existing) return err('Mapping already exists for this externalId', 409, 'DUPLICATE')

  const id = newId()
  const now = nowISO()
  await exec(
    `INSERT INTO CatalogSync (id, storeId, externalSource, externalId, productId, lastSyncAt, active, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storeId, b.externalSource, b.externalId, b.productId, now, 1, now],
  )

  return NextResponse.json({ id }, { status: 201 })
}
