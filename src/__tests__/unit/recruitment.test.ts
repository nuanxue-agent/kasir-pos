import { describe, it, expect } from 'vitest'
import {
  isValidTransition,
  getPipelineStageCount,
  calcTimeToHireDaysFromDates,
  calcOfferAcceptanceRate,
  rankApplicantsByScore,
  PIPELINE_STAGES,
  VALID_TRANSITIONS,
  type Applicant,
  type ApplicantStatus,
} from '@/components/hr/RecruitmentClient'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeApplicant(overrides: Partial<Applicant> = {}): Applicant {
  return {
    id: 'a1',
    jobId: 'j1',
    storeId: 's1',
    name: 'Budi Santoso',
    email: 'budi@example.com',
    phone: '08123456789',
    resumeUrl: '',
    status: 'NEW',
    notes: '',
    appliedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ─── 1. Stage transition validation ──────────────────────────────────────────

describe('Stage transition validation', () => {
  it('allows NEW -> SCREENING', () => {
    expect(isValidTransition('NEW', 'SCREENING')).toBe(true)
  })

  it('allows SCREENING -> INTERVIEW', () => {
    expect(isValidTransition('SCREENING', 'INTERVIEW')).toBe(true)
  })

  it('rejects NEW -> HIRED (skipping stages)', () => {
    expect(isValidTransition('NEW', 'HIRED')).toBe(false)
  })

  it('rejects HIRED -> any stage (terminal state)', () => {
    const targets: ApplicantStatus[] = ['NEW', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED']
    for (const t of targets) {
      expect(isValidTransition('HIRED', t)).toBe(false)
    }
  })

  it('allows any active stage -> REJECTED', () => {
    const fromStages: ApplicantStatus[] = ['NEW', 'SCREENING', 'INTERVIEW', 'OFFER']
    for (const s of fromStages) {
      expect(isValidTransition(s, 'REJECTED')).toBe(true)
    }
  })
})

// ─── 2. Pipeline stage count ──────────────────────────────────────────────────

describe('Pipeline stage count', () => {
  it('counts applicants per stage correctly', () => {
    const applicants = [
      makeApplicant({ id: 'a1', status: 'NEW' }),
      makeApplicant({ id: 'a2', status: 'NEW' }),
      makeApplicant({ id: 'a3', status: 'SCREENING' }),
      makeApplicant({ id: 'a4', status: 'INTERVIEW' }),
    ]
    const counts = getPipelineStageCount(applicants)
    expect(counts.NEW).toBe(2)
    expect(counts.SCREENING).toBe(1)
    expect(counts.INTERVIEW).toBe(1)
    expect(counts.OFFER).toBe(0)
    expect(counts.HIRED).toBe(0)
  })

  it('returns zero counts for all stages with empty list', () => {
    const counts = getPipelineStageCount([])
    for (const s of PIPELINE_STAGES) {
      expect(counts[s]).toBe(0)
    }
  })
})

// ─── 3. Time-to-hire calculation ──────────────────────────────────────────────

describe('Time-to-hire calculation', () => {
  it('calculates days between applied and hired date', () => {
    const days = calcTimeToHireDaysFromDates(
      '2024-01-01T00:00:00.000Z',
      '2024-01-15T00:00:00.000Z',
    )
    expect(days).toBe(14)
  })

  it('returns 0 when applied and hired on same day', () => {
    const days = calcTimeToHireDaysFromDates(
      '2024-03-10T00:00:00.000Z',
      '2024-03-10T00:00:00.000Z',
    )
    expect(days).toBe(0)
  })

  it('calculates correctly across month boundary', () => {
    const days = calcTimeToHireDaysFromDates(
      '2024-01-25T00:00:00.000Z',
      '2024-02-10T00:00:00.000Z',
    )
    expect(days).toBe(16)
  })
})

// ─── 4. Offer acceptance rate ─────────────────────────────────────────────────

describe('Offer acceptance rate', () => {
  it('returns 100% when all offered applicants are hired', () => {
    const applicants = [
      makeApplicant({ id: 'a1', status: 'HIRED' }),
      makeApplicant({ id: 'a2', status: 'HIRED' }),
    ]
    expect(calcOfferAcceptanceRate(applicants)).toBe(100)
  })

  it('returns 0% when no offers or hires', () => {
    const applicants = [
      makeApplicant({ id: 'a1', status: 'NEW' }),
      makeApplicant({ id: 'a2', status: 'SCREENING' }),
    ]
    expect(calcOfferAcceptanceRate(applicants)).toBe(0)
  })

  it('calculates partial acceptance correctly', () => {
    const applicants = [
      makeApplicant({ id: 'a1', status: 'HIRED' }),
      makeApplicant({ id: 'a2', status: 'OFFER' }),
      makeApplicant({ id: 'a3', status: 'OFFER' }),
    ]
    // 1 hired out of 3 in OFFER+HIRED = 33%
    expect(calcOfferAcceptanceRate(applicants)).toBe(33)
  })
})

// ─── 5. Applicant score ranking ───────────────────────────────────────────────

describe('Applicant score ranking', () => {
  it('ranks HIRED above OFFER above INTERVIEW', () => {
    const applicants = [
      makeApplicant({ id: 'a1', status: 'INTERVIEW' }),
      makeApplicant({ id: 'a2', status: 'HIRED' }),
      makeApplicant({ id: 'a3', status: 'OFFER' }),
    ]
    const ranked = rankApplicantsByScore(applicants)
    expect(ranked[0].applicant.status).toBe('HIRED')
    expect(ranked[1].applicant.status).toBe('OFFER')
    expect(ranked[2].applicant.status).toBe('INTERVIEW')
  })

  it('gives REJECTED applicants lowest score', () => {
    const applicants = [
      makeApplicant({ id: 'a1', status: 'REJECTED' }),
      makeApplicant({ id: 'a2', status: 'NEW' }),
    ]
    const ranked = rankApplicantsByScore(applicants)
    expect(ranked[ranked.length - 1].applicant.status).toBe('REJECTED')
  })
})
