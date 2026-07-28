import { describe, it, expect } from 'vitest'
import {
  PROFICIENCY_RANK,
  compareProficiency,
  isSkillExpired,
  calcSkillsGap,
  calcCoveragePercent,
  aggregateTeamSkills,
} from '@/app/api/hr/skills-gap/route'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const requirements = [
  { skillId: 's1', skillName: 'Kasir POS', category: 'TECHNICAL', requiredProficiency: 'INTERMEDIATE' },
  { skillId: 's2', skillName: 'Komunikasi', category: 'SOFT', requiredProficiency: 'ADVANCED' },
  { skillId: 's3', skillName: 'Stok Barang', category: 'OPERATIONAL', requiredProficiency: 'BEGINNER' },
]

const FUTURE = new Date(Date.now() + 86400_000 * 30).toISOString()
const PAST = new Date(Date.now() - 86400_000).toISOString()

// ─── 1. Proficiency rank ordering ─────────────────────────────────────────────

describe('PROFICIENCY_RANK', () => {
  it('should rank BEGINNER < INTERMEDIATE < ADVANCED < EXPERT', () => {
    expect(PROFICIENCY_RANK['BEGINNER']).toBeLessThan(PROFICIENCY_RANK['INTERMEDIATE'])
    expect(PROFICIENCY_RANK['INTERMEDIATE']).toBeLessThan(PROFICIENCY_RANK['ADVANCED'])
    expect(PROFICIENCY_RANK['ADVANCED']).toBeLessThan(PROFICIENCY_RANK['EXPERT'])
  })
})

// ─── 2. compareProficiency ────────────────────────────────────────────────────

describe('compareProficiency', () => {
  it('returns 0 when actual matches required', () => {
    expect(compareProficiency('INTERMEDIATE', 'INTERMEDIATE')).toBe(0)
  })

  it('returns negative when actual is below required', () => {
    expect(compareProficiency('BEGINNER', 'ADVANCED')).toBeLessThan(0)
  })

  it('returns positive when actual exceeds required', () => {
    expect(compareProficiency('EXPERT', 'BEGINNER')).toBeGreaterThan(0)
  })
})

// ─── 3. Skill expiry detection ────────────────────────────────────────────────

describe('isSkillExpired', () => {
  it('returns false when expiresAt is null', () => {
    expect(isSkillExpired(null)).toBe(false)
  })

  it('returns false when expiresAt is in the future', () => {
    expect(isSkillExpired(FUTURE)).toBe(false)
  })

  it('returns true when expiresAt is in the past', () => {
    expect(isSkillExpired(PAST)).toBe(true)
  })
})

// ─── 4. Skills gap detection ──────────────────────────────────────────────────

describe('calcSkillsGap', () => {
  it('marks skill as missing when employee has no record', () => {
    const gaps = calcSkillsGap(requirements, [])
    expect(gaps[0].missing).toBe(true)
    expect(gaps[0].gap).toBeLessThan(0)
  })

  it('marks skill as met when proficiency equals required', () => {
    const empSkills = [{ skillId: 's1', proficiency: 'INTERMEDIATE', expiresAt: null }]
    const gaps = calcSkillsGap(requirements, empSkills)
    const s1 = gaps.find(g => g.skillId === 's1')!
    expect(s1.missing).toBe(false)
    expect(s1.gap).toBe(0)
  })

  it('marks skill as gap when proficiency is below required', () => {
    const empSkills = [{ skillId: 's2', proficiency: 'BEGINNER', expiresAt: null }]
    const gaps = calcSkillsGap(requirements, empSkills)
    const s2 = gaps.find(g => g.skillId === 's2')!
    expect(s2.gap).toBeLessThan(0)
    expect(s2.missing).toBe(false)
  })

  it('marks skill as expired and penalises gap', () => {
    const empSkills = [{ skillId: 's1', proficiency: 'EXPERT', expiresAt: PAST }]
    const gaps = calcSkillsGap(requirements, empSkills)
    const s1 = gaps.find(g => g.skillId === 's1')!
    expect(s1.expired).toBe(true)
    expect(s1.gap).toBeLessThan(0)
  })
})

// ─── 5. Coverage percentage ───────────────────────────────────────────────────

describe('calcCoveragePercent', () => {
  it('returns 100 when no requirements', () => {
    expect(calcCoveragePercent([])).toBe(100)
  })

  it('returns 0 when all skills are missing', () => {
    const gaps = calcSkillsGap(requirements, [])
    expect(calcCoveragePercent(gaps)).toBe(0)
  })

  it('returns correct percent when some skills are met', () => {
    const empSkills = [
      { skillId: 's1', proficiency: 'INTERMEDIATE', expiresAt: null },
      { skillId: 's3', proficiency: 'BEGINNER', expiresAt: null },
    ]
    const gaps = calcSkillsGap(requirements, empSkills)
    // s1 met (gap 0), s2 missing, s3 met (gap 0) → 2/3 = 67%
    expect(calcCoveragePercent(gaps)).toBe(67)
  })
})

// ─── 6. Team skill aggregation ────────────────────────────────────────────────

describe('aggregateTeamSkills', () => {
  it('counts employees with a given skill, excluding expired', () => {
    const teamSkills = [
      { employeeId: 'e1', skillId: 's1', proficiency: 'BEGINNER', expiresAt: null },
      { employeeId: 'e2', skillId: 's1', proficiency: 'EXPERT', expiresAt: null },
      { employeeId: 'e3', skillId: 's1', proficiency: 'ADVANCED', expiresAt: PAST },
    ]
    const result = aggregateTeamSkills(teamSkills)
    expect(result['s1'].count).toBe(2)     // e3 excluded (expired)
  })

  it('tracks max proficiency across team', () => {
    const teamSkills = [
      { employeeId: 'e1', skillId: 's1', proficiency: 'BEGINNER', expiresAt: null },
      { employeeId: 'e2', skillId: 's1', proficiency: 'EXPERT', expiresAt: null },
    ]
    const result = aggregateTeamSkills(teamSkills)
    expect(result['s1'].maxProficiency).toBe('EXPERT')
  })

  it('returns proficiency breakdown per skill', () => {
    const teamSkills = [
      { employeeId: 'e1', skillId: 's1', proficiency: 'BEGINNER', expiresAt: null },
      { employeeId: 'e2', skillId: 's1', proficiency: 'BEGINNER', expiresAt: null },
      { employeeId: 'e3', skillId: 's1', proficiency: 'ADVANCED', expiresAt: null },
    ]
    const result = aggregateTeamSkills(teamSkills)
    expect(result['s1'].proficiencyBreakdown['BEGINNER']).toBe(2)
    expect(result['s1'].proficiencyBreakdown['ADVANCED']).toBe(1)
  })
})
