// GET/POST /api/fixed-assets
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export type AssetCategory = 'EQUIPMENT' | 'FURNITURE' | 'VEHICLE' | 'BUILDING' | 'IT' | 'OTHER'
export type DepreciationMethod = 'STRAIGHT_LINE' | 'DECLINING_BALANCE'
export type AssetStatus = 'ACTIVE' | 'DISPOSED' | 'FULLY_DEPRECIATED'

export async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS FixedAsset (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'EQUIPMENT',
    purchaseDate TEXT NOT NULL,
    purchasePrice REAL NOT NULL DEFAULT 0,
    usefulLifeYears REAL NOT NULL DEFAULT 5,
    residualValue REAL NOT NULL DEFAULT 0,
    depreciationMethod TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    currentBookValue REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    disposalDate TEXT,
    disposalProceeds REAL,
    createdAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS AssetDepreciation (
    id TEXT PRIMARY KEY,
    assetId TEXT NOT NULL,
    storeId TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    bookValueAfter REAL NOT NULL DEFAULT 0,
    recordedAt TEXT NOT NULL
  )`)
}

// GET /api/fixed-assets?storeId=xxx&status=ACTIVE&category=EQUIPMENT
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureTables()

    const status = url.searchParams.get('status')
    const category = url.searchParams.get('category')

    let sql = `SELECT * FROM FixedAsset WHERE storeId = ?`
    const params: unknown[] = [storeId]

    if (status) { sql += ` AND status = ?`; params.push(status) }
    if (category) { sql += ` AND category = ?`; params.push(category) }
    sql += ` ORDER BY createdAt DESC`

    const assets = await query<Record<string, unknown>>(sql, params)
    return ok(assets)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}

// POST /api/fixed-assets?storeId=xxx
// Body: { name, category, purchaseDate, purchasePrice, usefulLifeYears, residualValue?, depreciationMethod? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureTables()

    const body = await req.json() as {
      name?: string
      category?: AssetCategory
      purchaseDate?: string
      purchasePrice?: number
      usefulLifeYears?: number
      residualValue?: number
      depreciationMethod?: DepreciationMethod
    }

    if (!body.name?.trim()) return err('name required')
    if (!body.purchaseDate) return err('purchaseDate required')
    if (!body.purchasePrice || body.purchasePrice <= 0) return err('purchasePrice must be positive')
    if (!body.usefulLifeYears || body.usefulLifeYears <= 0) return err('usefulLifeYears must be positive')

    const VALID_CATEGORIES: AssetCategory[] = ['EQUIPMENT', 'FURNITURE', 'VEHICLE', 'BUILDING', 'IT', 'OTHER']
    const category: AssetCategory = body.category && VALID_CATEGORIES.includes(body.category) ? body.category : 'EQUIPMENT'
    const VALID_METHODS: DepreciationMethod[] = ['STRAIGHT_LINE', 'DECLINING_BALANCE']
    const depreciationMethod: DepreciationMethod = body.depreciationMethod && VALID_METHODS.includes(body.depreciationMethod) ? body.depreciationMethod : 'STRAIGHT_LINE'

    const purchasePrice = Number(body.purchasePrice)
    const usefulLifeYears = Number(body.usefulLifeYears)
    const residualValue = Number(body.residualValue ?? 0)
    const now = nowISO()
    const id = newId()

    await exec(
      `INSERT INTO FixedAsset (id, storeId, name, category, purchaseDate, purchasePrice, usefulLifeYears, residualValue, depreciationMethod, currentBookValue, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
      [id, storeId, body.name.trim(), category, body.purchaseDate, purchasePrice, usefulLifeYears, residualValue, depreciationMethod, purchasePrice, now]
    )

    return ok({ id, storeId, name: body.name.trim(), category, purchaseDate: body.purchaseDate, purchasePrice, usefulLifeYears, residualValue, depreciationMethod, currentBookValue: purchasePrice, status: 'ACTIVE', createdAt: now }, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return err(msg, 500)
  }
}
