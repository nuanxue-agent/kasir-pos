// GET/POST /api/landed-costs
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureLandedCostTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS LandedCost (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      poId TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'FREIGHT',
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'IDR',
      allocationMethod TEXT NOT NULL DEFAULT 'BY_VALUE',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      createdAt TEXT NOT NULL
    )
  `, [])
  await exec(`
    CREATE TABLE IF NOT EXISTS LandedCostAllocation (
      id TEXT PRIMARY KEY,
      landedCostId TEXT NOT NULL,
      storeId TEXT NOT NULL,
      productId TEXT NOT NULL,
      poItemId TEXT NOT NULL,
      allocatedAmount REAL NOT NULL DEFAULT 0,
      newUnitCost REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    )
  `, [])
}

// GET /api/landed-costs?storeId=xxx&poId=xxx&status=DRAFT|POSTED
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureLandedCostTables()

    const conditions: string[] = ['lc.storeId = ?']
    const vals: any[] = [storeId]

    const poId = sp.get('poId')
    if (poId) { conditions.push('lc.poId = ?'); vals.push(poId) }

    const status = sp.get('status')
    if (status) { conditions.push('lc.status = ?'); vals.push(status) }

    const rows = await query(
      `SELECT lc.*, po.poNumber
       FROM LandedCost lc
       LEFT JOIN PurchaseOrder po ON po.id = lc.poId
       WHERE ${conditions.join(' AND ')}
       ORDER BY lc.createdAt DESC`,
      vals,
    )

    return ok((rows as any[]).map(r => ({ ...r, amount: Number(r.amount) })))
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

// POST /api/landed-costs?storeId=xxx
// Body: { poId, type, amount, currency?, allocationMethod }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = (user.stores as any[])?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureLandedCostTables()

    const b = (await req.json()) as any
    if (!b.poId) return err("Field 'poId' is required")
    const validTypes = ['FREIGHT', 'DUTY', 'INSURANCE', 'OTHER']
    if (!validTypes.includes(b.type)) return err(`'type' must be one of ${validTypes.join(', ')}`)
    const amount = Number(b.amount)
    if (isNaN(amount) || amount <= 0) return err("'amount' must be a positive number")
    const validMethods = ['BY_VALUE', 'BY_QTY', 'BY_WEIGHT']
    if (!validMethods.includes(b.allocationMethod)) return err(`'allocationMethod' must be one of ${validMethods.join(', ')}`)

    const id = newId()
    const t = nowISO()
    await exec(
      `INSERT INTO LandedCost (id, storeId, poId, type, amount, currency, allocationMethod, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
      [id, storeId, b.poId, b.type, amount, b.currency ?? 'IDR', b.allocationMethod, t],
    )

    return ok({ id }, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
