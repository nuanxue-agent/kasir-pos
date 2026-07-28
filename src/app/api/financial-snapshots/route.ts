import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, newId, nowISO } from '@/lib/db'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

export async function ensureFinancialSnapshotTable() {
  await exec(`CREATE TABLE IF NOT EXISTS FinancialSnapshot (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    period TEXT NOT NULL,
    totalAssets REAL NOT NULL DEFAULT 0,
    currentAssets REAL NOT NULL DEFAULT 0,
    currentLiabilities REAL NOT NULL DEFAULT 0,
    inventory REAL NOT NULL DEFAULT 0,
    revenue REAL NOT NULL DEFAULT 0,
    grossProfit REAL NOT NULL DEFAULT 0,
    netProfit REAL NOT NULL DEFAULT 0,
    equity REAL NOT NULL DEFAULT 0,
    receivables REAL NOT NULL DEFAULT 0,
    computedAt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const sp = req.nextUrl.searchParams
    const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureFinancialSnapshotTable()

    const period = sp.get('period')
    const rows = period
      ? await query(
          `SELECT * FROM FinancialSnapshot WHERE storeId = ? AND period = ? ORDER BY computedAt DESC`,
          [storeId, period],
        )
      : await query(
          `SELECT * FROM FinancialSnapshot WHERE storeId = ? ORDER BY period DESC, computedAt DESC`,
          [storeId],
        )

    return ok(rows)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return err('Unauthorized', 401)
    const user = session.user as any

    const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
    if (!storeId) return err('storeId required')

    const hasAccess = user.stores?.some((s: { id: string }) => s.id === storeId) ?? false
    if (!hasAccess) return err('Forbidden', 403)

    await ensureFinancialSnapshotTable()

    const b = (await req.json()) as any
    if (!b.period) return err("Field 'period' is required")

    const id = newId()
    const now = nowISO()

    await exec(
      `INSERT INTO FinancialSnapshot
        (id, storeId, period, totalAssets, currentAssets, currentLiabilities, inventory,
         revenue, grossProfit, netProfit, equity, receivables, computedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        storeId,
        b.period,
        b.totalAssets ?? 0,
        b.currentAssets ?? 0,
        b.currentLiabilities ?? 0,
        b.inventory ?? 0,
        b.revenue ?? 0,
        b.grossProfit ?? 0,
        b.netProfit ?? 0,
        b.equity ?? 0,
        b.receivables ?? 0,
        b.computedAt ?? now,
        now,
        now,
      ],
    )

    const [row] = await query(`SELECT * FROM FinancialSnapshot WHERE id = ?`, [id])
    return ok(row, 201)
  } catch (e: any) {
    return err(e.message ?? 'Internal error', 500)
  }
}
