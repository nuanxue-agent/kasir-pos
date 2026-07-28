import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { aggregateScores, type PeerReview } from '@/lib/performance-review'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const rows = await query<any>(
      `SELECT pr.*, e.name AS revieweeName
       FROM PeerReview pr
       LEFT JOIN Employee e ON e.id = pr.revieweeId
       WHERE pr.cycleId = ?`,
      [params.id],
    )

    // Parse scores from JSON strings
    const reviews: PeerReview[] = rows.map((r: any) => ({
      ...r,
      scores: typeof r.scores === 'string' ? JSON.parse(r.scores) : r.scores,
    }))

    const aggregated = aggregateScores(reviews)

    // Attach reviewee names
    const nameMap: Record<string, string> = {}
    for (const r of rows) {
      if (r.revieweeId && r.revieweeName) nameMap[r.revieweeId] = r.revieweeName
    }

    const result = aggregated.map(a => ({
      ...a,
      revieweeName: nameMap[a.revieweeId] ?? a.revieweeId,
    }))

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
