import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export interface DailyTrend {
  date: string   // YYYY-MM-DD
  revenue: number
  transactions: number
  avgOrderValue: number
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    const days = Math.min(parseInt(searchParams.get('days') ?? '30', 10), 90)
    const now = new Date()
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    startDate.setHours(0, 0, 0, 0)

    const rows = await query(
      `SELECT
        DATE(createdAt) as date,
        COALESCE(SUM(total), 0) as revenue,
        COUNT(*) as transactions,
        COALESCE(AVG(total), 0) as avgOrderValue
       FROM "Order"
       WHERE storeId = ? AND status = 'PAID' AND createdAt >= ?
       GROUP BY DATE(createdAt)
       ORDER BY date ASC`,
      [storeId, startDate.toISOString()],
    ).catch(() => [])

    // Fill in missing days with zeros
    const byDate = new Map<string, DailyTrend>()
    for (const r of rows as any[]) {
      byDate.set(r.date, {
        date: r.date,
        revenue: r.revenue ?? 0,
        transactions: r.transactions ?? 0,
        avgOrderValue: r.avgOrderValue ?? 0,
      })
    }

    const trends: DailyTrend[] = []
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
      const dateStr = d.toISOString().slice(0, 10)
      trends.push(
        byDate.get(dateStr) ?? {
          date: dateStr,
          revenue: 0,
          transactions: 0,
          avgOrderValue: 0,
        },
      )
    }

    // Aggregate stats
    const totalRevenue = trends.reduce((s, t) => s + t.revenue, 0)
    const totalTransactions = trends.reduce((s, t) => s + t.transactions, 0)
    const avgDailyRevenue = trends.length > 0 ? totalRevenue / trends.length : 0

    // Simple linear trend slope (revenue)
    const n = trends.length
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    trends.forEach((t, i) => {
      sumX += i; sumY += t.revenue; sumXY += i * t.revenue; sumX2 += i * i
    })
    const slope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0
    const trendDirection: 'up' | 'down' | 'flat' =
      slope > 100 ? 'up' : slope < -100 ? 'down' : 'flat'

    return NextResponse.json({
      trends,
      summary: {
        totalRevenue,
        totalTransactions,
        avgDailyRevenue,
        trendDirection,
        slope,
        days,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
