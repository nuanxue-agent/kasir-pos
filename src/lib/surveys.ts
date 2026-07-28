// Pure business logic for employee surveys — no DB or Next.js imports

export type SurveyType = 'SATISFACTION' | 'PULSE' | 'EXIT' | 'ONBOARDING'
export type SurveyStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED'
export type QuestionType = 'RATING' | 'TEXT' | 'MULTIPLE_CHOICE' | 'YES_NO' | 'SCALE'

export interface SurveyQuestion {
  id: string
  type: QuestionType
  text: string
  required: boolean
  options?: string[]   // for MULTIPLE_CHOICE
  min?: number         // for SCALE / RATING
  max?: number         // for SCALE / RATING
}

export interface SurveyAnswer {
  questionId: string
  value: string | number
}

export interface Survey {
  id: string
  storeId: string
  title: string
  description: string
  type: SurveyType
  questions: SurveyQuestion[]
  startDate: string
  endDate: string
  anonymous: boolean
  status: SurveyStatus
  createdAt: string
  updatedAt: string
}

export interface SurveyResponse {
  id: string
  surveyId: string
  employeeId: string
  storeId: string
  answers: SurveyAnswer[]
  submittedAt: string
}

// ─── Status machine ────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<SurveyStatus, SurveyStatus[]> = {
  DRAFT:  ['ACTIVE'],
  ACTIVE: ['CLOSED'],
  CLOSED: [],
}

export function isValidStatusTransition(from: SurveyStatus, to: SurveyStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── Question validation ───────────────────────────────────────────────────────

export function validateQuestion(q: SurveyQuestion): string | null {
  if (!q.id || !q.id.trim()) return 'Question id is required'
  if (!q.text || !q.text.trim()) return 'Question text is required'
  if (!['RATING', 'TEXT', 'MULTIPLE_CHOICE', 'YES_NO', 'SCALE'].includes(q.type)) {
    return `Invalid question type: ${q.type}`
  }
  if (q.type === 'MULTIPLE_CHOICE') {
    if (!q.options || q.options.length < 2) return 'MULTIPLE_CHOICE questions need at least 2 options'
  }
  if (q.type === 'SCALE' || q.type === 'RATING') {
    const min = q.min ?? 1
    const max = q.max ?? 5
    if (max <= min) return 'Scale max must be greater than min'
  }
  return null
}

export function validateQuestions(questions: SurveyQuestion[]): string | null {
  if (!questions || questions.length === 0) return 'Survey must have at least one question'
  for (const q of questions) {
    const err = validateQuestion(q)
    if (err) return err
  }
  // Check for duplicate IDs
  const ids = questions.map(q => q.id)
  if (new Set(ids).size !== ids.length) return 'Question IDs must be unique'
  return null
}

// ─── Response aggregation ──────────────────────────────────────────────────────

export interface QuestionAggregate {
  questionId: string
  questionText: string
  questionType: QuestionType
  totalAnswers: number
  // For RATING / SCALE: numeric stats
  average?: number
  min?: number
  max?: number
  // For MULTIPLE_CHOICE / YES_NO: option counts
  optionCounts?: Record<string, number>
  // For TEXT: sample responses (up to 5)
  textSamples?: string[]
}

export function aggregateResponses(
  survey: Pick<Survey, 'questions'>,
  responses: SurveyResponse[],
): QuestionAggregate[] {
  return survey.questions.map(q => {
    const answers = responses
      .flatMap(r => r.answers)
      .filter(a => a.questionId === q.id)

    const base: QuestionAggregate = {
      questionId: q.id,
      questionText: q.text,
      questionType: q.type,
      totalAnswers: answers.length,
    }

    if (q.type === 'RATING' || q.type === 'SCALE') {
      const nums = answers.map(a => Number(a.value)).filter(n => !isNaN(n))
      if (nums.length > 0) {
        base.average = Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100
        base.min = Math.min(...nums)
        base.max = Math.max(...nums)
      }
    } else if (q.type === 'MULTIPLE_CHOICE' || q.type === 'YES_NO') {
      const counts: Record<string, number> = {}
      for (const a of answers) {
        const key = String(a.value)
        counts[key] = (counts[key] ?? 0) + 1
      }
      base.optionCounts = counts
    } else if (q.type === 'TEXT') {
      base.textSamples = answers.slice(0, 5).map(a => String(a.value))
    }

    return base
  })
}

// ─── Completion rate ───────────────────────────────────────────────────────────

export function calcCompletionRate(totalEmployees: number, responseCount: number): number {
  if (totalEmployees <= 0) return 0
  return Math.min(100, Math.round((responseCount / totalEmployees) * 100))
}

// ─── Anonymous response check ──────────────────────────────────────────────────

export function sanitizeResponseForAnonymous(
  response: SurveyResponse,
  anonymous: boolean,
): SurveyResponse {
  if (!anonymous) return response
  return { ...response, employeeId: 'anonymous' }
}

// ─── Survey date validity ──────────────────────────────────────────────────────

export function isSurveyOpen(survey: Pick<Survey, 'status' | 'startDate' | 'endDate'>, now = new Date()): boolean {
  if (survey.status !== 'ACTIVE') return false
  const start = new Date(survey.startDate)
  const end = new Date(survey.endDate)
  return now >= start && now <= end
}
