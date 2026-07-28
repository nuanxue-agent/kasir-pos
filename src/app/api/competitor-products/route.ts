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
}

// GET /api/competitor-products?storeId=xxx
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
      `SELECT * FROM CompetitorProduct WHERE storeId = ? ORDER BY competitorName, productName`,
      [storeId],
    )

    return ok(rows)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}

// POST /api/competitor-products
// Body: { storeId?, competitorName, productName, price, url?, notes? }
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

    if (!body.competitorName?.trim()) return err('competitorName is required')
    if (!body.productName?.trim()) return err('productName is required')
    if (body.price === undefined || body.price === null) return err('price is required')

    await ensureTables()

    const id = newId()
    const recordedAt = body.recordedAt ?? nowISO()

    await exec(
      `INSERT INTO CompetitorProduct (id, storeId, competitorName, productName, price, url, notes, recordedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        storeId,
        body.competitorName.trim(),
        body.productName.trim(),
        Number(body.price),
        body.url ?? null,
        body.notes ?? null,
        recordedAt,
      ],
    )

    return ok({ id, competitorName: body.competitorName.trim(), productName: body.productName.trim(), price: Number(body.price) }, 201)
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
