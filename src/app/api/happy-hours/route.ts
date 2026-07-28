import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS HappyHour (
    id            TEXT PRIMARY KEY,
    storeId       TEXT NOT NULL,
    name          TEXT NOT NULL,
    days          TEXT NOT NULL DEFAULT '[]',
    startTime     TEXT NOT NULL DEFAULT '17:00',
    endTime       TEXT NOT NULL DEFAULT '19:00',
    discountType  TEXT NOT NULL DEFAULT 'PERCENTAGE',
    discountValue REAL NOT NULL DEFAULT 0,
    appliesTo     TEXT NOT NULL DEFAULT 'ALL',
    targetIds     TEXT NOT NULL DEFAULT '[]',
    active        INTEGER NOT NULL DEFAULT 1,
    createdAt     TEXT NOT NULL,
    updatedAt     TEXT NOT NULL
  )`)
}

function parseRow(r: any) {
  return {
    ...r,
    days: typeof r.days === 'string' ? JSON.parse(r.days) : r.days,
    targetIds: typeof r.targetIds === 'string' ? JSON.parse(r.targetIds) : r.targetIds,
    active: Boolean(r.active),
  }
}

// GET /api/happy-hours?storeId=&active=
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    await ensureTables()

    const conditions: string[] = ['storeId = ?']
    const params: any[] = [storeId]

    const activeParam = url.searchParams.get('active')
    if (activeParam !== null) {
      conditions.push('active = ?')
      params.push(activeParam === '1' || activeParam === 'true' ? 1 : 0)
    }

    const rows = await query(
      `SELECT * FROM HappyHour WHERE ${conditions.join(' AND ')} ORDER BY startTime ASC`,
      params,
    )

    return ok((rows as any[]).map(parseRow))
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/happy-hours?storeId=
// Body: { name, days, startTime, endTime, discountType, discountValue, appliesTo, targetIds, active? }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const url = new URL(req.url)
    const storeId = url.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const body = (await req.json()) as any
    const {
      name,
      days,
      startTime,
      endTime,
      discountType,
      discountValue,
      appliesTo,
      targetIds,
      active,
    } = body

    if (!name?.trim()) return err('name required')
    if (!Array.isArray(days) || days.length === 0) return err('at least one day required')
    if (!startTime || !endTime) return err('startTime and endTime required')
    if (!discountType || !['PERCENTAGE', 'FIXED', 'BOGO'].includes(discountType)) {
      return err('invalid discountType')
    }
    if (!appliesTo || !['ALL', 'CATEGORY', 'PRODUCT'].includes(appliesTo)) {
      return err('invalid appliesTo')
    }

    await ensureTables()

    const id = newId()
    const now = nowISO()

    await exec(
      `INSERT INTO HappyHour (id, storeId, name, days, startTime, endTime, discountType, discountValue, appliesTo, targetIds, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        storeId,
        name.trim(),
        JSON.stringify(days),
        startTime,
        endTime,
        discountType,
        discountValue ?? 0,
        appliesTo,
        JSON.stringify(targetIds ?? []),
        active === false ? 0 : 1,
        now,
        now,
      ],
    )

    const rows = await query('SELECT * FROM HappyHour WHERE id = ?', [id])
    return ok(parseRow((rows as any[])[0]), 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
