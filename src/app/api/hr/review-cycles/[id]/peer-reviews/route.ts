import { NextRequest, NextResponse } from 'next/server'
import { query, exec, newId, nowISO } from '@/lib/db'

async function ensurePeerReviewTable() {
  await exec(`CREATE TABLE IF NOT EXISTS PeerReview (
    id TEXT PRIMARY KEY,
    cycleId TEXT NOT NULL,
    reviewerId TEXT NOT NULL,
    revieweeId TEXT NOT NULL,
    storeId TEXT NOT NULL,
    scores TEXT NOT NULL,
    comments TEXT,
    submittedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await ensurePeerReviewTable()
    const { searchParams } = new URL(req.url)
    const revieweeId = searchParams.get('revieweeId')

    let sql = `SELECT pr.*,
      reviewer.name AS reviewerName,
      reviewee.name AS revieweeName
      FROM PeerReview pr
      LEFT JOIN Employee reviewer ON reviewer.id = pr.reviewerId
      LEFT JOIN Employee reviewee ON reviewee.id = pr.revieweeId
      WHERE pr.cycleId = ?`
    const sqlParams: any[] = [params.id]

    if (revieweeId) { sql += ' AND pr.revieweeId = ?'; sqlParams.push(revieweeId) }
    sql += ' ORDER BY pr.createdAt DESC'

    const rows = await query(sql, sqlParams)
    // Parse scores JSON for each row
    const parsed = rows.map((r: any) => ({
      ...r,
      scores: typeof r.scores === 'string' ? JSON.parse(r.scores) : r.scores,
    }))
    return NextResponse.json(parsed)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await ensurePeerReviewTable()
    const body = (await req.json()) as {
      reviewerId?: string
      revieweeId?: string
      storeId?: string
      scores?: { communication?: number; teamwork?: number; skills?: number; attitude?: number }
      comments?: string
      submit?: boolean
    }
    const { reviewerId, revieweeId, storeId, scores, comments, submit } = body

    if (!reviewerId || !revieweeId || !storeId || !scores) {
      return NextResponse.json(
        { error: 'reviewerId, revieweeId, storeId, scores required' },
        { status: 400 },
      )
    }

    const normalised = {
      communication: Math.min(5, Math.max(1, scores.communication ?? 3)),
      teamwork: Math.min(5, Math.max(1, scores.teamwork ?? 3)),
      skills: Math.min(5, Math.max(1, scores.skills ?? 3)),
      attitude: Math.min(5, Math.max(1, scores.attitude ?? 3)),
    }

    const id = newId()
    const now = nowISO()
    const submittedAt = submit ? now : null

    await exec(
      `INSERT INTO PeerReview (id, cycleId, reviewerId, revieweeId, storeId, scores, comments, submittedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.id, reviewerId, revieweeId, storeId, JSON.stringify(normalised), comments ?? null, submittedAt, now, now],
    )
    return NextResponse.json({ id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
