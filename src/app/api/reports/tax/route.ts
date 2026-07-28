// API route: GET /api/reports/tax
// Returns monthly/quarterly/yearly PPN + PPh 23 summary for a store
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'

const PPH23_THRESHOLD = 500_000 // Rp 500,000
const PPH23_RATE = 0.02 // 2%

function ok(data: unknown) {
  return NextResponse.json(data)
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// Group rows by period key
function periodKey(dateStr: string, groupBy: string): string {
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  if (groupBy === 'year') return `${y}`
  if (groupBy === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`
  // default: month
  return `${y}-${String(m).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  const user = session.user as any
  const storeIds: string[] = user.stores?.map((s: any) => s.id) ?? []

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId') ?? ''
  const from = searchParams.get('from') ?? `${new Date().getFullYear()}-01-01`
  const to = searchParams.get('to') ?? `${new Date().getFullYear()}-12-31`
  const groupBy = searchParams.get('groupBy') ?? 'month' // month | quarter | year

  if (!storeId || !storeIds.includes(storeId)) return err('Store not found', 403)

  try {
    // Ensure TaxConfig table exists (lazy init)
    await query(`
      CREATE TABLE IF NOT EXISTS TaxConfig (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        ppnRate REAL NOT NULL DEFAULT 0.11,
        ppnEnabled INTEGER NOT NULL DEFAULT 1,
        ppnIncluded INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `)

    // Fetch tax config
    const taxConfigs = await query<any>(
      `SELECT ppnRate, ppnEnabled, ppnIncluded FROM TaxConfig WHERE storeId = ? LIMIT 1`,
      [storeId],
    )
    const taxConfig = taxConfigs[0] ?? { ppnRate: 0.11, ppnEnabled: 1, ppnIncluded: 0 }
    const ppnRate: number = taxConfig.ppnRate ?? 0.11
    const ppnEnabled: boolean = Boolean(taxConfig.ppnEnabled)
    const ppnIncluded: boolean = Boolean(taxConfig.ppnIncluded)

    // Fetch orders in range with category info
    const orders = await query<any>(
      `SELECT
         o.id,
         o.createdAt,
         o.total,
         o.subtotal,
         o.tax,
         o.discount,
         o.customerType,
         oi.productId,
         oi.qty,
         oi.price,
         p.category
       FROM \`Order\` o
       LEFT JOIN OrderItem oi ON oi.orderId = o.id
       LEFT JOIN Product p ON p.id = oi.productId
       WHERE o.storeId = ?
         AND o.status = 'completed'
         AND DATE(o.createdAt) BETWEEN ? AND ?
      `,
      [storeId, from, to],
    )

    // Aggregate per order (dedupe rows from join)
    const orderMap = new Map<string, {
      createdAt: string
      total: number
      subtotal: number
      tax: number
      discount: number
      customerType: string | null
      categories: Set<string>
      itemTotal: number
    }>()

    for (const row of orders) {
      if (!orderMap.has(row.id)) {
        orderMap.set(row.id, {
          createdAt: row.createdAt,
          total: row.total,
          subtotal: row.subtotal ?? row.total,
          tax: row.tax ?? 0,
          discount: row.discount ?? 0,
          customerType: row.customerType ?? null,
          categories: new Set(),
          itemTotal: 0,
        })
      }
      const entry = orderMap.get(row.id)!
      if (row.category) entry.categories.add(row.category)
      entry.itemTotal += (row.price ?? 0) * (row.qty ?? 1)
    }

    // Build period buckets
    const periodMap = new Map<string, {
      period: string
      grossRevenue: number
      taxableRevenue: number
      taxCollected: number
      pphBase: number
      pphCollected: number
      orderCount: number
      categoryBreakdown: Map<string, { taxable: number; tax: number }>
    }>()

    for (const [, order] of orderMap) {
      const pk = periodKey(order.createdAt, groupBy)

      if (!periodMap.has(pk)) {
        periodMap.set(pk, {
          period: pk,
          grossRevenue: 0,
          taxableRevenue: 0,
          taxCollected: 0,
          pphBase: 0,
          pphCollected: 0,
          orderCount: 0,
          categoryBreakdown: new Map(),
        })
      }

      const bucket = periodMap.get(pk)!
      bucket.orderCount++

      const gross = order.total
      let taxable: number
      let taxAmt: number

      if (!ppnEnabled) {
        taxable = gross
        taxAmt = 0
      } else if (ppnIncluded) {
        // Tax-inclusive: DPP = gross × 100/(100 + rate*100)
        taxable = gross / (1 + ppnRate)
        taxAmt = gross - taxable
      } else {
        // Tax-exclusive: DPP = subtotal after discount
        taxable = Math.max(0, (order.subtotal ?? gross) - (order.discount ?? 0))
        taxAmt = taxable * ppnRate
      }

      bucket.grossRevenue += gross
      bucket.taxableRevenue += taxable
      bucket.taxCollected += taxAmt

      // PPh 23: B2B transactions above threshold
      if (order.customerType === 'business' && gross >= PPH23_THRESHOLD) {
        bucket.pphBase += taxable
        bucket.pphCollected += taxable * PPH23_RATE
      }

      // Category breakdown
      const cats = order.categories.size > 0 ? [...order.categories] : ['Uncategorized']
      const perCat = taxable / cats.length
      const taxPerCat = taxAmt / cats.length
      for (const cat of cats) {
        if (!bucket.categoryBreakdown.has(cat)) {
          bucket.categoryBreakdown.set(cat, { taxable: 0, tax: 0 })
        }
        const cb = bucket.categoryBreakdown.get(cat)!
        cb.taxable += perCat
        cb.tax += taxPerCat
      }
    }

    // Convert to sorted array
    const result = [...periodMap.values()]
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(b => ({
        period: b.period,
        grossRevenue: Math.round(b.grossRevenue),
        taxableRevenue: Math.round(b.taxableRevenue),
        taxCollected: Math.round(b.taxCollected),
        pphBase: Math.round(b.pphBase),
        pphCollected: Math.round(b.pphCollected),
        orderCount: b.orderCount,
        ppnRate,
        categoryBreakdown: [...b.categoryBreakdown.entries()].map(([category, v]) => ({
          category,
          taxable: Math.round(v.taxable),
          tax: Math.round(v.tax),
        })),
      }))

    return ok({ data: result, ppnRate, ppnEnabled, ppnIncluded })
  } catch (e: any) {
    console.error('Tax report error:', e)
    return err('Gagal memuat laporan pajak', 500)
  }
}
