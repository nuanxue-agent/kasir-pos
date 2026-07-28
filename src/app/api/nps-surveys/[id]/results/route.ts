// GET /api/nps-surveys/:id/results
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { queryOne, query } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function calcNps(responses: { score: number }[]): number | null {
  if (responses.length === 0) return null
  const promoters = responses.filter(r => r.score >= 9).length
  const detractors = responses.filter(r => r.score <= 6).length
  return Math.round(((promoters - detractors) / responses.length) * 100)
}

function getWeekKey(iso: string): string {
  const d = new Date(iso)
  const day = d.getUTCDay() // 0=Sun
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1) // Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff))
  return monday.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400)

  const { id: surveyId } = await params

  const survey = await queryOne(`SELECT * FROM NpsSurvey WHERE id=? AND storeId=?`, [surveyId, storeId])
  if (!survey) return err('Survey not found', 404)

  const responses = await query(
    `SELECT score, createdAt FROM NpsResponse WHERE surveyId=? ORDER BY createdAt ASC`,
    [surveyId],
  ) as { score: number; createdAt: string }[]

  // Segment breakdown
  const promoters = responses.filter(r => r.score >= 9).length
  const passives = responses.filter(r => r.score >= 7 && r.score <= 8).length
  const detractors = responses.filter(r => r.score <= 6).length
  const total = responses.length
  const npsScore = calcNps(responses)

  // Weekly trend — last 12 weeks
  const now = new Date()
  const weeks: { week: string; nps: number | null; count: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay() + 1 - i * 7))
    const sunday = new Date(monday.getTime() + 6 * 86400000)
    const weekKey = monday.toISOString().slice(0, 10)
    const weekResponses = responses.filter(r => {
      const d = r.createdAt.slice(0, 10)
      return d >= weekKey && d <= sunday.toISOString().slice(0, 10)
    })
    weeks.push({ week: weekKey, nps: calcNps(weekResponses), count: weekResponses.length })
  }

  return NextResponse.json({
    surveyId,
    npsScore,
    total,
    breakdown: {
      promoters,
      passives,
      detractors,
      promoterPct: total > 0 ? Math.round((promoters / total) * 100) : 0,
      passivePct: total > 0 ? Math.round((passives / total) * 100) : 0,
      detractorPct: total > 0 ? Math.round((detractors / total) * 100) : 0,
    },
    weeklyTrend: weeks,
  })
}
