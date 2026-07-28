import { describe, it, expect } from 'vitest'
import {
  isValidStatusTransition,
  aggregateResponses,
  calcCompletionRate,
  validateQuestions,
  validateQuestion,
  isSurveyOpen,
  sanitizeResponseForAnonymous,
  type Survey,
  type SurveyQuestion,
  type SurveyResponse,
  type SurveyStatus,
} from '@/lib/surveys'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeSurvey(overrides: Partial<Survey> = {}): Survey {
  return {
    id: 's1',
    storeId: 'store1',
    title: 'Monthly Pulse',
    description: '',
    type: 'PULSE',
    questions: [],
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    anonymous: false,
    status: 'DRAFT',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeResponse(overrides: Partial<SurveyResponse> = {}): SurveyResponse {
  return {
    id: 'r1',
    surveyId: 's1',
    employeeId: 'emp1',
    storeId: 'store1',
    answers: [],
    submittedAt: '2026-06-01T10:00:00.000Z',
    ...overrides,
  }
}

const ratingQuestion: SurveyQuestion = {
  id: 'q1',
  type: 'RATING',
  text: 'How satisfied are you?',
  required: true,
  min: 1,
  max: 5,
}

const choiceQuestion: SurveyQuestion = {
  id: 'q2',
  type: 'MULTIPLE_CHOICE',
  text: 'Which area needs improvement?',
  required: false,
  options: ['Communication', 'Work-life balance', 'Management', 'Compensation'],
}

const textQuestion: SurveyQuestion = {
  id: 'q3',
  type: 'TEXT',
  text: 'Any additional feedback?',
  required: false,
}

const yesNoQuestion: SurveyQuestion = {
  id: 'q4',
  type: 'YES_NO',
  text: 'Would you recommend this company?',
  required: true,
}

// ─── 1. Survey status transitions ─────────────────────────────────────────────

describe('Survey status transitions', () => {
  it('allows DRAFT → ACTIVE', () => {
    expect(isValidStatusTransition('DRAFT', 'ACTIVE')).toBe(true)
  })

  it('allows ACTIVE → CLOSED', () => {
    expect(isValidStatusTransition('ACTIVE', 'CLOSED')).toBe(true)
  })

  it('disallows DRAFT → CLOSED (must go through ACTIVE)', () => {
    expect(isValidStatusTransition('DRAFT', 'CLOSED')).toBe(false)
  })

  it('disallows CLOSED → ACTIVE (terminal state)', () => {
    expect(isValidStatusTransition('CLOSED', 'ACTIVE')).toBe(false)
  })

  it('disallows CLOSED → DRAFT (terminal state)', () => {
    expect(isValidStatusTransition('CLOSED', 'DRAFT')).toBe(false)
  })

  it('disallows ACTIVE → DRAFT', () => {
    expect(isValidStatusTransition('ACTIVE', 'DRAFT')).toBe(false)
  })
})

// ─── 2. Response aggregation ───────────────────────────────────────────────────

describe('Response aggregation', () => {
  it('aggregates RATING answers into average, min, max', () => {
    const survey = makeSurvey({ questions: [ratingQuestion] })
    const responses = [
      makeResponse({ id: 'r1', answers: [{ questionId: 'q1', value: 4 }] }),
      makeResponse({ id: 'r2', answers: [{ questionId: 'q1', value: 2 }] }),
      makeResponse({ id: 'r3', answers: [{ questionId: 'q1', value: 5 }] }),
    ]
    const [agg] = aggregateResponses(survey, responses)
    expect(agg.average).toBeCloseTo(11 / 3, 1)
    expect(agg.min).toBe(2)
    expect(agg.max).toBe(5)
    expect(agg.totalAnswers).toBe(3)
  })

  it('aggregates MULTIPLE_CHOICE answers into option counts', () => {
    const survey = makeSurvey({ questions: [choiceQuestion] })
    const responses = [
      makeResponse({ id: 'r1', answers: [{ questionId: 'q2', value: 'Communication' }] }),
      makeResponse({ id: 'r2', answers: [{ questionId: 'q2', value: 'Management' }] }),
      makeResponse({ id: 'r3', answers: [{ questionId: 'q2', value: 'Communication' }] }),
    ]
    const [agg] = aggregateResponses(survey, responses)
    expect(agg.optionCounts).toEqual({ Communication: 2, Management: 1 })
    expect(agg.totalAnswers).toBe(3)
  })

  it('returns up to 5 text samples for TEXT questions', () => {
    const survey = makeSurvey({ questions: [textQuestion] })
    const responses = Array.from({ length: 7 }, (_, i) =>
      makeResponse({ id: `r${i}`, answers: [{ questionId: 'q3', value: `feedback ${i}` }] }),
    )
    const [agg] = aggregateResponses(survey, responses)
    expect(agg.textSamples).toHaveLength(5)
  })

  it('returns zero totalAnswers when no responses exist', () => {
    const survey = makeSurvey({ questions: [ratingQuestion] })
    const [agg] = aggregateResponses(survey, [])
    expect(agg.totalAnswers).toBe(0)
    expect(agg.average).toBeUndefined()
  })

  it('aggregates YES_NO answers as option counts', () => {
    const survey = makeSurvey({ questions: [yesNoQuestion] })
    const responses = [
      makeResponse({ id: 'r1', answers: [{ questionId: 'q4', value: 'Yes' }] }),
      makeResponse({ id: 'r2', answers: [{ questionId: 'q4', value: 'Yes' }] }),
      makeResponse({ id: 'r3', answers: [{ questionId: 'q4', value: 'No' }] }),
    ]
    const [agg] = aggregateResponses(survey, responses)
    expect(agg.optionCounts?.Yes).toBe(2)
    expect(agg.optionCounts?.No).toBe(1)
  })
})

// ─── 3. Anonymous response handling ───────────────────────────────────────────

describe('Anonymous response handling', () => {
  it('strips employeeId when survey is anonymous', () => {
    const response = makeResponse({ employeeId: 'emp-secret-123' })
    const sanitized = sanitizeResponseForAnonymous(response, true)
    expect(sanitized.employeeId).toBe('anonymous')
  })

  it('preserves employeeId when survey is not anonymous', () => {
    const response = makeResponse({ employeeId: 'emp-secret-123' })
    const sanitized = sanitizeResponseForAnonymous(response, false)
    expect(sanitized.employeeId).toBe('emp-secret-123')
  })

  it('does not mutate the original response object', () => {
    const response = makeResponse({ employeeId: 'emp-original' })
    sanitizeResponseForAnonymous(response, true)
    expect(response.employeeId).toBe('emp-original')
  })
})

// ─── 4. Question type validation ──────────────────────────────────────────────

describe('Question type validation', () => {
  it('rejects an invalid question type', () => {
    const q = { ...ratingQuestion, type: 'EMOJI' as any }
    expect(validateQuestion(q)).toContain('Invalid question type')
  })

  it('rejects MULTIPLE_CHOICE with fewer than 2 options', () => {
    const q: SurveyQuestion = { ...choiceQuestion, options: ['Only one'] }
    expect(validateQuestion(q)).toContain('at least 2 options')
  })

  it('rejects SCALE question when max <= min', () => {
    const q: SurveyQuestion = { id: 'qs', type: 'SCALE', text: 'Rate', required: true, min: 5, max: 3 }
    expect(validateQuestion(q)).toContain('max must be greater than min')
  })

  it('accepts a valid MULTIPLE_CHOICE question', () => {
    expect(validateQuestion(choiceQuestion)).toBeNull()
  })

  it('rejects a survey with no questions', () => {
    expect(validateQuestions([])).toContain('at least one question')
  })

  it('rejects duplicate question IDs', () => {
    const q1 = { ...ratingQuestion, id: 'dup' }
    const q2 = { ...textQuestion, id: 'dup' }
    expect(validateQuestions([q1, q2])).toContain('unique')
  })
})

// ─── 5. Completion rate ────────────────────────────────────────────────────────

describe('Completion rate', () => {
  it('calculates completion rate correctly', () => {
    expect(calcCompletionRate(20, 15)).toBe(75)
  })

  it('returns 0 when totalEmployees is 0', () => {
    expect(calcCompletionRate(0, 5)).toBe(0)
  })

  it('caps at 100 even with more responses than employees', () => {
    expect(calcCompletionRate(10, 15)).toBe(100)
  })

  it('returns 0 when no responses', () => {
    expect(calcCompletionRate(50, 0)).toBe(0)
  })
})

// ─── 6. Survey open check ─────────────────────────────────────────────────────

describe('isSurveyOpen', () => {
  it('returns false for DRAFT survey', () => {
    const s = makeSurvey({ status: 'DRAFT', startDate: '2020-01-01', endDate: '2099-12-31' })
    expect(isSurveyOpen(s)).toBe(false)
  })

  it('returns true for ACTIVE survey within date range', () => {
    const s = makeSurvey({ status: 'ACTIVE', startDate: '2020-01-01', endDate: '2099-12-31' })
    expect(isSurveyOpen(s)).toBe(true)
  })

  it('returns false for ACTIVE survey past end date', () => {
    const s = makeSurvey({ status: 'ACTIVE', startDate: '2020-01-01', endDate: '2021-01-01' })
    const now = new Date('2025-06-01')
    expect(isSurveyOpen(s, now)).toBe(false)
  })

  it('returns false for CLOSED survey', () => {
    const s = makeSurvey({ status: 'CLOSED', startDate: '2020-01-01', endDate: '2099-12-31' })
    expect(isSurveyOpen(s)).toBe(false)
  })
})
