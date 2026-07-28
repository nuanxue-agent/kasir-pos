import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS CompetitorProduct (
    id             TEXT PRIMARY KEY,
    storeId        TEXT NOT NULL,
    competitorName TEXT NOT NULL,
    productName    TEXT NOT NULL,
    price          REAL NOT NULL DEFAULT 0,
    url            TEXT,
    notes          TEXT,
    recordedAt     TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS ComparisonReport (
    id                  TEXT PRIMARY KEY,
    storeId             TEXT NOT NULL,
    ourProductId        TEXT NOT NULL,
    competitorProductId TEXT NOT NULL,
    priceDiff           REAL NOT NULL DEFAULT 0,
    priceDiffPct        REAL NOT NULL DEFAULT 0,
    advantage           TEXT NOT NULL DEFAULT 'COMPETITIVE',
    createdAt           TEXT NOT NULL
  )`)
}

// GET /api/comparison-reports?storeId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const user = session.user as { stores?: { id: string }[] }
    const urlStoreId = new URL(req.url).searchParams.get('storeId')
    const storeId: string =
      (urlStoreId && user.stores?.some(s => s.id === urlStoreId) ? urlStoreId : null) ??
      user.stores?.[0]?.id ??
      ''
    if (!storeId) return err('Forbidden', 403)

    await ensureTables()

    const rows = await query(
      `SELECT r.*,
              p.name  AS ourProductName,
              p.price AS ourProductPrice,
              c.competitorName,
              c.productName AS competitorProductName,
              c.price       AS competitorPrice
       FROM ComparisonReport r
       LEFT JOIN Product          p ON p.id = r.ourProductId
       LEFT JOIN CompetitorProduct c ON c.id = r.competitorProductId
       WHERE r.storeId = ?
       ORDER BY r.createdAt DESC`,
      [storeId],
    )

    return ok(rows)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/comparison-reports
// Body: { storeId?, ourProductId, competitorProductId, priceDiff, priceDiffPct, advantage }
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)

    const body = (await req.json()) as any
    const user = session.user as { stores?: { id: string }[] }
    const storeId: string = body.storeId ?? user.stores?.[0]?.id ?? ''
    if (!storeId) return err('storeId required')
    const hasAccess = user.stores?.some(s => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    if (!body.ourProductId)        return err('ourProductId is required')
    if (!body.competitorProductId) return err('competitorProductId is required')

    const validAdvantages = ['CHEAPER', 'COMPETITIVE', 'EXPENSIVE']
    const advantage: string = body.advantage ?? 'COMPETITIVE'
    if (!validAdvantages.includes(advantage)) return err('advantage must be CHEAPER, COMPETITIVE, or EXPENSIVE')

    await ensureTables()

    const id = newId()
    const createdAt = nowISO()

    await exec(
      `INSERT INTO ComparisonReport (id, storeId, ourProductId, competitorProductId, priceDiff, priceDiffPct, advantage, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        storeId,
        body.ourProductId,
        body.competitorProductId,
        Number(body.priceDiff ?? 0),
        Number(body.priceDiffPct ?? 0),
        advantage,
        createdAt,
      ],
    )

    return ok({ id, ourProductId: body.ourProductId, competitorProductId: body.competitorProductId, advantage }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
