import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'
import type { CommissionType } from '@/lib/commissions'

async function ensureTable() {
  await exec(`CREATE TABLE IF NOT EXISTS CommissionRule (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    employeeId TEXT,
    type TEXT NOT NULL DEFAULT 'PERCENTAGE',
    value REAL NOT NULL DEFAULT 0,
    minSales REAL NOT NULL DEFAULT 0,
    maxSales REAL,
    productCategory TEXT,
    tiers TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

const VALID_TYPES: CommissionType[] = ['FIXED', 'PERCENTAGE', 'TIERED']

export async function GET(req: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    const employeeId = searchParams.get('employeeId')
    const activeOnly = searchParams.get('active') !== 'false'

    let sql = `SELECT cr.*, e.name as employeeName
      FROM CommissionRule cr
      LEFT JOIN Employee e ON e.id = cr.employeeId
      WHERE cr.storeId = ?`
    const params: any[] = [storeId]

    if (employeeId) { sql += ' AND (cr.employeeId = ? OR cr.employeeId IS NULL)'; params.push(employeeId) }
    if (activeOnly) { sql += ' AND cr.active = 1' }

    sql += ' ORDER BY cr.createdAt DESC'

    const rows = await query(sql, params)
    // Parse tiers JSON
    const data = rows.map((r: any) => ({
      ...r,
      active: r.active === 1 || r.active === true,
      tiers: r.tiers ? JSON.parse(r.tiers) : null,
    }))
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable()
    const body = await req.json() as any
    const {
      storeId,
      employeeId = null,
      type = 'PERCENTAGE',
      value = 0,
      minSales = 0,
      maxSales = null,
      productCategory = null,
      tiers = null,
      active = true,
    } = body

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: `type must be one of ${VALID_TYPES.join(', ')}` }, { status: 400 })
    }
    if (type !== 'TIERED' && (value == null || value < 0)) {
      return NextResponse.json({ error: 'value must be >= 0' }, { status: 400 })
    }
    if (type === 'TIERED' && (!tiers || !Array.isArray(tiers) || tiers.length === 0)) {
      return NextResponse.json({ error: 'tiers array required for TIERED type' }, { status: 400 })
    }

    const id = newId()
    const now = nowISO()
    await exec(
      `INSERT INTO CommissionRule (id, storeId, employeeId, type, value, minSales, maxSales, productCategory, tiers, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, employeeId, type, value, minSales, maxSales, productCategory,
       tiers ? JSON.stringify(tiers) : null, active ? 1 : 0, now, now],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
