import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureVendorEvaluationTable } from '../route'
import { detectScoreTrend } from '@/lib/vendor-evaluation'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const sp = req.nextUrl.searchParams
  const storeId = sp.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureVendorEvaluationTable()

  // Aggregate avg scores per vendor
  const aggRows = await query(
    `SELECT
       ve.vendorId,
       v.name as vendorName,
       COUNT(*) as evaluationCount,
       AVG(ve.deliveryScore) as avgDelivery,
       AVG(ve.qualityScore) as avgQuality,
       AVG(ve.priceScore) as avgPrice,
       AVG(ve.communicationScore) as avgCommunication,
       AVG(ve.overallScore) as avgOverall
     FROM VendorEvaluation ve
     LEFT JOIN Vendor v ON ve.vendorId = v.id
     WHERE ve.storeId = ?
     GROUP BY ve.vendorId, v.name
     ORDER BY avgOverall DESC`,
    [storeId]
  )

  // Fetch trend data for each vendor (last 10 evaluations)
  const trendRows = await query(
    `SELECT vendorId, overallScore, evaluatedAt
     FROM VendorEvaluation
     WHERE storeId = ?
     ORDER BY evaluatedAt ASC`,
    [storeId]
  )

  // Group trend data by vendorId
  const trendMap: Record<string, { overallScore: number; evaluatedAt: string }[]> = {}
  for (const row of trendRows as any[]) {
    if (!trendMap[row.vendorId]) trendMap[row.vendorId] = []
    trendMap[row.vendorId].push({ overallScore: row.overallScore, evaluatedAt: row.evaluatedAt })
  }

  const round2 = (n: number) => Math.round(Number(n) * 100) / 100
  const PREFERRED_THRESHOLD = 4.0
  const MIN_EVALUATIONS = 2

  const scorecards = (aggRows as any[]).map((row) => {
    const avgOverall = round2(row.avgOverall)
    const count = Number(row.evaluationCount)
    const trend = detectScoreTrend(trendMap[row.vendorId] ?? [])

    return {
      vendorId: row.vendorId,
      vendorName: row.vendorName ?? row.vendorId,
      avgDelivery: round2(row.avgDelivery),
      avgQuality: round2(row.avgQuality),
      avgPrice: round2(row.avgPrice),
      avgCommunication: round2(row.avgCommunication),
      avgOverall,
      evaluationCount: count,
      trend,
      isPreferred: avgOverall >= PREFERRED_THRESHOLD && count >= MIN_EVALUATIONS,
    }
  })

  return NextResponse.json(scorecards)
}
