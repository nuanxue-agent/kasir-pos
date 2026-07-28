import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { ensureNPSTables } from '../../route'
import { calcNPS, calcSegmentBreakdown, calcAverageScore, calcTrend } from '@/lib/nps-surveys'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureNPSTables()
    const { id: surveyId } = await params
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return err('storeId required')

    const from = searchParams.get('from')
    const to   = searchParams.get('to')

    const [survey] = await query(`SELECT * FROM NPSSurvey WHERE id = ?`, [surveyId])
    if (!survey) return err('Survey not found', 404)

    // Current period responses
    let sql = `SELECT score, channel, respondedAt FROM NPSResponse WHERE surveyId = ? AND storeId = ?`
    const p: any[] = [surveyId, storeId]
    if (from) { sql += ' AND respondedAt >= ?'; p.push(from) }
    if (to)   { sql += ' AND respondedAt <= ?'; p.push(to) }

    const current = await query(sql, p)

    // Previous period (same length, shifted back) for trend
    let trend = null
    if (from && to) {
      const fromDate  = new Date(from)
      const toDate    = new Date(to)
      const periodMs  = toDate.getTime() - fromDate.getTime()
      const prevTo    = new Date(fromDate.getTime() - 1).toISOString()
      const prevFrom  = new Date(fromDate.getTime() - periodMs - 1).toISOString()

      const prevRows = await query(
        `SELECT score FROM NPSResponse WHERE surveyId = ? AND storeId = ?
         AND respondedAt >= ? AND respondedAt <= ?`,
        [surveyId, storeId, prevFrom, prevTo],
      )
      trend = calcTrend(current as any[], prevRows as any[])
    }

    const breakdown  = calcNPS(current as any[])
    const segments   = calcSegmentBreakdown(current as any[])
    const avgScore   = calcAverageScore(current as any[])

    // Channel breakdown
    const channelMap: Record<string, number> = {}
    for (const r of current as any[]) {
      channelMap[r.channel] = (channelMap[r.channel] ?? 0) + 1
    }

    return NextResponse.json({
      data: {
        survey,
        npsScore:    breakdown.npsScore,
        promoters:   breakdown.promoters,
        passives:    breakdown.passives,
        detractors:  breakdown.detractors,
        total:       breakdown.total,
        avgScore,
        segments,
        channelBreakdown: channelMap,
        trend,
      },
    })
  } catch (e: any) {
    return err(e.message, 500)
  }
}
