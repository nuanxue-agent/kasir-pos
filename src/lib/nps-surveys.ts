// ── NPS Survey pure-function helpers ──────────────────────────────────────────

export type TriggerType = 'POST_PURCHASE' | 'MANUAL' | 'SCHEDULED'
export type Channel = 'EMAIL' | 'SMS' | 'IN_APP'

export interface NPSSurvey {
  id: string
  storeId: string
  name: string
  question: string
  active: number // 0 | 1
  triggerType: TriggerType
  createdAt: string
  updatedAt: string
}

export interface NPSResponse {
  id: string
  surveyId: string
  storeId: string
  customerId: string | null
  score: number // 0-10
  comment: string | null
  channel: Channel
  respondedAt: string
}

export type Segment = 'PROMOTER' | 'PASSIVE' | 'DETRACTOR'

// ── Classification ─────────────────────────────────────────────────────────────

export function classifyScore(score: number): Segment {
  if (score >= 9) return 'PROMOTER'
  if (score >= 7) return 'PASSIVE'
  return 'DETRACTOR'
}

// ── NPS score ─────────────────────────────────────────────────────────────────

export interface NPSBreakdown {
  promoters: number
  passives: number
  detractors: number
  total: number
  npsScore: number // -100 to 100, rounded to 1 decimal
}

export function calcNPS(responses: Pick<NPSResponse, 'score'>[]): NPSBreakdown {
  const total = responses.length
  if (total === 0) {
    return { promoters: 0, passives: 0, detractors: 0, total: 0, npsScore: 0 }
  }

  let promoters = 0
  let passives = 0
  let detractors = 0

  for (const r of responses) {
    const seg = classifyScore(r.score)
    if (seg === 'PROMOTER') promoters++
    else if (seg === 'PASSIVE') passives++
    else detractors++
  }

  const npsScore = Math.round(((promoters - detractors) / total) * 100 * 10) / 10
  return { promoters, passives, detractors, total, npsScore }
}

// ── Response rate ──────────────────────────────────────────────────────────────

export function calcResponseRate(
  responseCount: number,
  sentCount: number,
): number {
  if (sentCount === 0) return 0
  return Math.round((responseCount / sentCount) * 100 * 10) / 10
}

// ── Segment breakdown (percentage share) ──────────────────────────────────────

export interface SegmentBreakdown {
  segment: Segment
  count: number
  pct: number // 0-100, rounded to 1 decimal
}

export function calcSegmentBreakdown(
  responses: Pick<NPSResponse, 'score'>[],
): SegmentBreakdown[] {
  const bd = calcNPS(responses)
  const { total } = bd
  const pct = (n: number) =>
    total === 0 ? 0 : Math.round((n / total) * 100 * 10) / 10

  return [
    { segment: 'PROMOTER',  count: bd.promoters,  pct: pct(bd.promoters) },
    { segment: 'PASSIVE',   count: bd.passives,   pct: pct(bd.passives) },
    { segment: 'DETRACTOR', count: bd.detractors, pct: pct(bd.detractors) },
  ]
}

// ── Trend: compare two time periods ───────────────────────────────────────────

export interface TrendResult {
  current: NPSBreakdown
  previous: NPSBreakdown
  delta: number // npsScore change, rounded to 1 decimal
  trend: 'UP' | 'DOWN' | 'FLAT'
}

export function calcTrend(
  current: Pick<NPSResponse, 'score'>[],
  previous: Pick<NPSResponse, 'score'>[],
): TrendResult {
  const cur = calcNPS(current)
  const prev = calcNPS(previous)
  const delta = Math.round((cur.npsScore - prev.npsScore) * 10) / 10
  const trend: TrendResult['trend'] =
    delta > 0 ? 'UP' : delta < 0 ? 'DOWN' : 'FLAT'
  return { current: cur, previous: prev, delta, trend }
}

// ── Period filter ──────────────────────────────────────────────────────────────

export function filterByPeriod(
  responses: NPSResponse[],
  from: string,
  to: string,
): NPSResponse[] {
  return responses.filter(
    (r) => r.respondedAt >= from && r.respondedAt <= to,
  )
}

// ── Average score ─────────────────────────────────────────────────────────────

export function calcAverageScore(
  responses: Pick<NPSResponse, 'score'>[],
): number {
  if (responses.length === 0) return 0
  const sum = responses.reduce((acc, r) => acc + r.score, 0)
  return Math.round((sum / responses.length) * 10) / 10
}
