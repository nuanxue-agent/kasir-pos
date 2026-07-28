import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

const VALID_TARGET_TYPES = ['STORE', 'EMPLOYEE', 'PRODUCT_CATEGORY'] as const
const VALID_PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const

export async function ensureSalesTargetTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS SalesTarget (
      id           TEXT PRIMARY KEY,
      storeId      TEXT NOT NULL,
      targetType   TEXT NOT NULL,
      targetId     TEXT NOT NULL,
      period       TEXT NOT NULL,
      targetAmount REAL NOT NULL DEFAULT 0,
      startDate    TEXT NOT NULL,
      endDate      TEXT NOT NULL,
      createdAt    TEXT NOT NULL,
      updatedAt    TEXT NOT NULL
    )
  `)
  await exec(`
    CREATE TABLE IF NOT EXISTS SalesAchievement (
      id             TEXT PRIMARY KEY,
      targetId       TEXT NOT NULL,
      storeId        TEXT NOT NULL,
      actualAmount   REAL NOT NULL DEFAULT 0,
      achievementPct REAL NOT NULL DEFAULT 0,
      period         TEXT NOT NULL,
      computedAt     TEXT NOT NULL
    )
  `)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId || !storeIds.includes(storeId))
    return err('Store not found', 403, 'FORBIDDEN')

  try {
    await ensureSalesTargetTables()

    const targetType = sp.get('targetType') ?? ''
    const period = sp.get('period') ?? ''

    let sql = `SELECT * FROM SalesTarget WHERE storeId = ?`
    const params: any[] = [storeId]

    if (targetType && VALID_TARGET_TYPES.includes(targetType as any)) {
      sql += ` AND targetType = ?`
      params.push(targetType)
    }
    if (period && VALID_PERIODS.includes(period as any)) {
      sql += ` AND period = ?`
      params.push(period)
    }

    sql += ` ORDER BY createdAt DESC`
    const rows = await query(sql, params)
    return NextResponse.json(rows)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500, 'INTERNAL_ERROR')
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  try {
    await ensureSalesTargetTables()
    const b = (await req.json()) as any

    const storeId: string = b.storeId ?? req.nextUrl.searchParams.get('storeId') ?? ''
    if (!storeId || !storeIds.includes(storeId))
      return err('Store not found', 403, 'FORBIDDEN')

    if (!VALID_TARGET_TYPES.includes(b.targetType))
      return err('Invalid targetType', 400, 'INVALID_FIELD')
    if (!VALID_PERIODS.includes(b.period))
      return err('Invalid period', 400, 'INVALID_FIELD')
    if (!b.targetId) return err("Field 'targetId' is required", 400, 'MISSING_FIELD')
    if (!b.startDate) return err("Field 'startDate' is required", 400, 'MISSING_FIELD')
    if (!b.endDate) return err("Field 'endDate' is required", 400, 'MISSING_FIELD')

    const targetAmount = Number(b.targetAmount ?? 0)
    if (isNaN(targetAmount) || targetAmount < 0)
      return err('targetAmount must be a non-negative number', 400, 'INVALID_FIELD')

    // Check for overlapping targets for the same targetId + period
    const overlaps = await query(
      `SELECT id FROM SalesTarget
       WHERE storeId = ? AND targetType = ? AND targetId = ? AND period = ?
         AND startDate < ? AND endDate > ?`,
      [storeId, b.targetType, b.targetId, b.period, b.endDate, b.startDate]
    )
    if ((overlaps as any[]).length > 0)
      return err('Target period overlaps with an existing target', 400, 'OVERLAP_DETECTED')

    const t = nowISO()
    const id = newId()
    await exec(
      `INSERT INTO SalesTarget
        (id, storeId, targetType, targetId, period, targetAmount, startDate, endDate, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storeId, b.targetType, b.targetId, b.period, targetAmount, b.startDate, b.endDate, t, t]
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500, 'INTERNAL_ERROR')
  }
}
