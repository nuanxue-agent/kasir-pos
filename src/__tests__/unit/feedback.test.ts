import { describe, it, expect } from 'vitest'

// ── Pure functions mirroring feedback module logic ────────────────────────────

type QuestionType = 'RATING' | 'NPS' | 'TEXT' | 'MULTIPLE_CHOICE'

interface Question {
  id: string
  type: QuestionType
  text: string
  options?: string[]
  order: number
}

interface Response {
  id: string
  surveyId: string
  customerId?: string | null
  answers: Record<string, number | string>
  submittedAt: string
}

// ── NPS helpers ───────────────────────────────────────────────────────────────

function calcAvgNps(responses: Response[], npsQuestionIds: string[]): number | null {
  const vals: number[] = []
  for (const r of responses) {
    for (const qId of npsQuestionIds) {
      const v = r.answers[qId]
      if (v !== undefined && !isNaN(Number(v))) vals.push(Number(v))
    }
  }
  if (vals.length === 0) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

function classifyNps(score: number | null): 'promoter' | 'passive' | 'detractor' | null {
  if (score === null) return null
  if (score >= 9) return 'promoter'
  if (score >= 7) return 'passive'
  return 'detractor'
}

function npsBreakdown(responses: Response[], npsQuestionIds: string[]) {
  let promoters = 0, passives = 0, detractors = 0
  for (const r of responses) {
    for (const qId of npsQuestionIds) {
      const v = Number(r.answers[qId])
      if (!isNaN(v)) {
        if (v >= 9) promoters++
        else if (v >= 7) passives++
        else detractors++
      }
    }
  }
  return { promoters, passives, detractors }
}

// ── Rating helpers ────────────────────────────────────────────────────────────

function calcAvgRating(responses: Response[], ratingQuestionIds: string[]): number | null {
  const vals: number[] = []
  for (const r of responses) {
    for (const qId of ratingQuestionIds) {
      const v = r.answers[qId]
      if (v !== undefined && !isNaN(Number(v))) vals.push(Number(v))
    }
  }
  if (vals.length === 0) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

// ── Survey completion rate ────────────────────────────────────────────────────

function surveyCompletionRate(
  questions: Question[],
  response: Response,
): number {
  const required = questions.filter(q => q.type !== 'TEXT')
  if (required.length === 0) return 1
  const answered = required.filter(q => {
    const v = response.answers[q.id]
    return v !== undefined && v !== null && v !== ''
  })
  return answered.length / required.length
}

// ── Question validation ───────────────────────────────────────────────────────

function validateQuestion(q: Partial<Question>): string | null {
  if (!q.text || String(q.text).trim().length === 0) return 'Teks pertanyaan harus diisi'
  if (!q.type) return 'Tipe pertanyaan harus dipilih'
  const valid = new Set(['RATING', 'NPS', 'TEXT', 'MULTIPLE_CHOICE'])
  if (!valid.has(q.type)) return `Tipe tidak valid: ${q.type}`
  if (q.type === 'MULTIPLE_CHOICE' && (!q.options || q.options.length < 2))
    return 'Pilihan ganda memerlukan minimal 2 pilihan'
  return null
}

// ── Response aggregation ──────────────────────────────────────────────────────

function aggregateTextResponses(responses: Response[], questionId: string): string[] {
  return responses
    .map(r => r.answers[questionId])
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}

// ── WhatsApp link ─────────────────────────────────────────────────────────────

function buildWhatsAppSurveyLink(surveyId: string, baseUrl: string, surveyName: string): string {
  const url = `${baseUrl}/survey/${surveyId}`
  const text = encodeURIComponent(`Isi survei "${surveyName}": ${url}`)
  return `https://wa.me/?text=${text}`
}

// ── Test data ─────────────────────────────────────────────────────────────────

const NPS_Q_ID = 'q-nps-1'
const RATING_Q_ID = 'q-rating-1'
const TEXT_Q_ID = 'q-text-1'
const MC_Q_ID = 'q-mc-1'

const sampleQuestions: Question[] = [
  { id: NPS_Q_ID, type: 'NPS', text: 'Seberapa besar kemungkinan Anda merekomendasikan kami?', order: 0 },
  { id: RATING_Q_ID, type: 'RATING', text: 'Nilai layanan kami', order: 1 },
  { id: TEXT_Q_ID, type: 'TEXT', text: 'Masukan tambahan', order: 2 },
  { id: MC_Q_ID, type: 'MULTIPLE_CHOICE', text: 'Bagaimana Anda mengetahui kami?', options: ['Media sosial', 'Teman', 'Iklan'], order: 3 },
]

const sampleResponses: Response[] = [
  { id: 'r1', surveyId: 's1', answers: { [NPS_Q_ID]: 10, [RATING_Q_ID]: 5, [TEXT_Q_ID]: 'Bagus!' }, submittedAt: '2025-01-01T10:00:00Z' },
  { id: 'r2', surveyId: 's1', answers: { [NPS_Q_ID]: 9, [RATING_Q_ID]: 4 }, submittedAt: '2025-01-02T10:00:00Z' },
  { id: 'r3', surveyId: 's1', answers: { [NPS_Q_ID]: 7, [RATING_Q_ID]: 3, [TEXT_Q_ID]: 'Cukup baik' }, submittedAt: '2025-01-03T10:00:00Z' },
  { id: 'r4', surveyId: 's1', answers: { [NPS_Q_ID]: 4, [RATING_Q_ID]: 2 }, submittedAt: '2025-01-04T10:00:00Z' },
  { id: 'r5', surveyId: 's1', answers: { [NPS_Q_ID]: 3, [RATING_Q_ID]: 1, [TEXT_Q_ID]: 'Perlu perbaikan' }, submittedAt: '2025-01-05T10:00:00Z' },
]

// ═════════════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('NPS score calculation', () => {
  it('calculates average NPS correctly', () => {
    const avg = calcAvgNps(sampleResponses, [NPS_Q_ID])
    // (10+9+7+4+3)/5 = 33/5 = 6.6
    expect(avg).toBe(6.6)
  })

  it('returns null when no NPS responses exist', () => {
    const result = calcAvgNps(sampleResponses, ['nonexistent-q'])
    expect(result).toBeNull()
  })

  it('classifies NPS scores correctly', () => {
    expect(classifyNps(10)).toBe('promoter')
    expect(classifyNps(9)).toBe('promoter')
    expect(classifyNps(8)).toBe('passive')
    expect(classifyNps(7)).toBe('passive')
    expect(classifyNps(6)).toBe('detractor')
    expect(classifyNps(0)).toBe('detractor')
    expect(classifyNps(null)).toBeNull()
  })

  it('breaks down NPS into promoters/passives/detractors', () => {
    const breakdown = npsBreakdown(sampleResponses, [NPS_Q_ID])
    // 10, 9 = promoters (2); 7 = passive (1); 4, 3 = detractors (2)
    expect(breakdown.promoters).toBe(2)
    expect(breakdown.passives).toBe(1)
    expect(breakdown.detractors).toBe(2)
  })
})

describe('Survey completion rate', () => {
  it('returns 1.0 when all non-text questions answered', () => {
    const response: Response = {
      id: 'r', surveyId: 's1',
      answers: { [NPS_Q_ID]: 9, [RATING_Q_ID]: 4, [MC_Q_ID]: 'Teman' },
      submittedAt: '2025-01-01T00:00:00Z',
    }
    const rate = surveyCompletionRate(sampleQuestions, response)
    expect(rate).toBe(1)
  })

  it('returns partial rate when some questions unanswered', () => {
    const response: Response = {
      id: 'r', surveyId: 's1',
      answers: { [NPS_Q_ID]: 9 },
      submittedAt: '2025-01-01T00:00:00Z',
    }
    // required non-TEXT = NPS, RATING, MC = 3. answered = NPS only = 1
    const rate = surveyCompletionRate(sampleQuestions, response)
    expect(rate).toBeCloseTo(1 / 3)
  })

  it('handles survey with only TEXT questions (completion = 1)', () => {
    const textOnlyQuestions: Question[] = [
      { id: TEXT_Q_ID, type: 'TEXT', text: 'Feedback', order: 0 },
    ]
    const response: Response = { id: 'r', surveyId: 's1', answers: {}, submittedAt: '' }
    expect(surveyCompletionRate(textOnlyQuestions, response)).toBe(1)
  })
})

describe('Response aggregation', () => {
  it('aggregates text responses for a question', () => {
    const texts = aggregateTextResponses(sampleResponses, TEXT_Q_ID)
    expect(texts).toHaveLength(3)
    expect(texts).toContain('Bagus!')
    expect(texts).toContain('Cukup baik')
    expect(texts).toContain('Perlu perbaikan')
  })

  it('returns empty array when no text answers exist', () => {
    const texts = aggregateTextResponses(sampleResponses, MC_Q_ID)
    expect(texts).toHaveLength(0)
  })
})

describe('Question validation', () => {
  it('rejects question with empty text', () => {
    expect(validateQuestion({ type: 'RATING', text: '', order: 0 })).toBe('Teks pertanyaan harus diisi')
  })

  it('rejects question with invalid type', () => {
    expect(validateQuestion({ type: 'UNKNOWN' as QuestionType, text: 'Q?', order: 0 })).toMatch(/tidak valid/)
  })

  it('rejects MULTIPLE_CHOICE with fewer than 2 options', () => {
    expect(validateQuestion({ type: 'MULTIPLE_CHOICE', text: 'Q?', options: ['one'], order: 0 })).toMatch(/minimal 2/)
  })

  it('accepts valid questions of each type', () => {
    expect(validateQuestion({ type: 'NPS', text: 'Recommend?', order: 0 })).toBeNull()
    expect(validateQuestion({ type: 'RATING', text: 'Rate us', order: 0 })).toBeNull()
    expect(validateQuestion({ type: 'TEXT', text: 'Comments?', order: 0 })).toBeNull()
    expect(validateQuestion({ type: 'MULTIPLE_CHOICE', text: 'Source?', options: ['A', 'B'], order: 0 })).toBeNull()
  })
})

describe('Analytics computation', () => {
  it('calculates average rating correctly', () => {
    const avg = calcAvgRating(sampleResponses, [RATING_Q_ID])
    // (5+4+3+2+1)/5 = 3
    expect(avg).toBe(3)
  })

  it('builds a WhatsApp survey link with correct format', () => {
    const link = buildWhatsAppSurveyLink('survey-123', 'https://myapp.com', 'Kepuasan Pelanggan')
    expect(link).toMatch(/^https:\/\/wa\.me\/\?text=/)
    expect(link).toContain('survey-123')
    expect(link).toContain('myapp.com')
  })
})
