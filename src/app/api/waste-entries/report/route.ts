// GET /api/waste-entries/report?storeId=&from=&to=&groupBy=day|week
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureWasteTable } from '../route'

function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }) }
function err(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }) }

interface WasteEntryRow {
  id: string
  storeId: string
  productId: string
  productName: string
  qty: number
  unit: string
  reason: string
  cost: number
  recordedBy: string
  recordedAt: string
  shift: string
  notes: string | null
}

// GET /api/waste-entries/report?storeId=&from=&to=&groupBy=day|week
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

    await ensureWasteTable()

    const from = url.searchParams.get('from') ?? new Date(Date.now() - 30 * 86400_000).toISOString()
    const to = url.searchParams.get('to') ?? new Date().toISOString()
    const groupBy = url.searchParams.get('groupBy') ?? 'day'

    const entries = await query(
      `SELECT * FROM WasteEntry WHERE storeId = ? AND recordedAt >= ? AND recordedAt <= ? ORDER BY recordedAt ASC`,
      [storeId, from, to]
    ) as WasteEntryRow[]

    // ── Aggregations ──────────────────────────────────────────────────────────

    // By product
    const byProduct: Record<string, { productName: string; qty: number; cost: number; entries: number }> = {}
    // By reason
    const byReason: Record<string, { qty: number; cost: number }> = {}
    // By shift
    const byShift: Record<string, { qty: number; cost: number }> = {}
    // By day or week
    const byPeriod: Record<string, { qty: number; cost: number }> = {}

    let totalQty = 0
    let totalCost = 0

    for (const e of entries) {
      totalQty += e.qty
      totalCost += e.cost

      // By product
      if (!byProduct[e.productId]) byProduct[e.productId] = { productName: e.productName, qty: 0, cost: 0, entries: 0 }
      byProduct[e.productId].qty += e.qty
      byProduct[e.productId].cost += e.cost
      byProduct[e.productId].entries += 1

      // By reason
      if (!byReason[e.reason]) byReason[e.reason] = { qty: 0, cost: 0 }
      byReason[e.reason].qty += e.qty
      byReason[e.reason].cost += e.cost

      // By shift
      if (!byShift[e.shift]) byShift[e.shift] = { qty: 0, cost: 0 }
      byShift[e.shift].qty += e.qty
      byShift[e.shift].cost += e.cost

      // By period (day = YYYY-MM-DD, week = YYYY-Www)
      const dateStr = e.recordedAt.substring(0, 10)
      let periodKey: string
      if (groupBy === 'week') {
        const d = new Date(dateStr)
        const startOfYear = new Date(d.getFullYear(), 0, 1)
        const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400_000 + startOfYear.getDay() + 1) / 7)
        periodKey = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
      } else {
        periodKey = dateStr
      }
      if (!byPeriod[periodKey]) byPeriod[periodKey] = { qty: 0, cost: 0 }
      byPeriod[periodKey].qty += e.qty
      byPeriod[periodKey].cost += e.cost
    }

    // Top products by cost
    const topProducts = Object.entries(byProduct)
      .map(([productId, data]) => ({ productId, ...data }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 20)

    // Period series sorted
    const periodSeries = Object.entries(byPeriod)
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => a.period.localeCompare(b.period))

    return ok({
      summary: { totalQty, totalCost, entryCount: entries.length },
      byReason,
      byShift,
      topProducts,
      periodSeries,
      from,
      to,
      groupBy,
    })
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Internal error', 500)
  }
}
