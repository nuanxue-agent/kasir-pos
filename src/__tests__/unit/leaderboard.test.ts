import { describe, it, expect } from 'vitest'
import { calcRankBadge } from '@/components/crm/LeaderboardClient'

// ─── Pure business logic helpers (mirrors what the API would do) ───────────────

type Period = 'WEEKLY' | 'MONTHLY' | 'ALL_TIME'

interface LeaderboardEntry {
  id: string
  customerId: string
  period: Period
  points: number
  totalSpend: number
  visitCount: number
  rank: number
}

interface PrizeEntry {
  id: string
  period: Period
  rank: number
  prize: string
  claimed: boolean
}

/** Assign ranks to entries sorted by points DESC, totalSpend DESC (tie-break) */
export function rankEntries(entries: Omit<LeaderboardEntry, 'rank'>[]): LeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return b.totalSpend - a.totalSpend // tie-break: higher spend wins
  })
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }))
}

/** Filter entries by period */
export function filterByPeriod(entries: LeaderboardEntry[], period: Period): LeaderboardEntry[] {
  return entries.filter(e => e.period === period)
}

/** Determine if a customer is eligible for a prize at their rank */
export function isPrizeEligible(entry: LeaderboardEntry, prizes: PrizeEntry[]): boolean {
  return prizes.some(p => p.period === entry.period && p.rank === entry.rank && !p.claimed)
}

/** Return the prize for a given rank+period (unclaimed only) */
export function getPrize(rank: number, period: Period, prizes: PrizeEntry[]): PrizeEntry | null {
  return prizes.find(p => p.rank === rank && p.period === period && !p.claimed) ?? null
}

/** Returns top-3 entries (badge winners) */
export function getTopThree(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return entries.filter(e => e.rank <= 3).sort((a, b) => a.rank - b.rank)
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

const raw: Omit<LeaderboardEntry, 'rank'>[] = [
  { id: 'e1', customerId: 'c1', period: 'MONTHLY', points: 500, totalSpend: 2000, visitCount: 10 },
  { id: 'e2', customerId: 'c2', period: 'MONTHLY', points: 800, totalSpend: 3000, visitCount: 15 },
  { id: 'e3', customerId: 'c3', period: 'MONTHLY', points: 300, totalSpend: 1000, visitCount: 5 },
  { id: 'e4', customerId: 'c4', period: 'WEEKLY', points: 200, totalSpend: 500, visitCount: 3 },
  { id: 'e5', customerId: 'c5', period: 'MONTHLY', points: 800, totalSpend: 2500, visitCount: 12 },
]

const prizes: PrizeEntry[] = [
  { id: 'p1', period: 'MONTHLY', rank: 1, prize: '$50 Gift Card', claimed: false },
  { id: 'p2', period: 'MONTHLY', rank: 2, prize: 'Free Coffee', claimed: true },
  { id: 'p3', period: 'MONTHLY', rank: 3, prize: '10% Discount', claimed: false },
  { id: 'p4', period: 'WEEKLY', rank: 1, prize: 'Free Drink', claimed: false },
]

describe('Leaderboard — rank calculation', () => {
  it('should rank entries by points descending', () => {
    const ranked = rankEntries(raw.filter(e => e.period === 'MONTHLY'))
    expect(ranked[0].customerId).toBe('c2') // 800 pts
    // c5 also 800 pts but lower spend → rank 2
    expect(ranked[1].customerId).toBe('c5')
    expect(ranked[2].customerId).toBe('c1') // 500 pts
    expect(ranked[3].customerId).toBe('c3') // 300 pts
  })

  it('should assign sequential rank numbers starting at 1', () => {
    const ranked = rankEntries(raw.filter(e => e.period === 'MONTHLY'))
    const rankValues = ranked.map(e => e.rank)
    expect(rankValues).toEqual([1, 2, 3, 4])
  })

  it('should break ties by totalSpend (higher wins)', () => {
    // c2 and c5 both have 800 points; c2 has 3000 spend vs c5's 2500
    const ranked = rankEntries(raw.filter(e => e.period === 'MONTHLY'))
    expect(ranked[0].customerId).toBe('c2')
    expect(ranked[1].customerId).toBe('c5')
  })
})

describe('Leaderboard — period filtering', () => {
  it('should return only entries matching the requested period', () => {
    const all = rankEntries(raw)
    const weekly = filterByPeriod(all, 'WEEKLY')
    expect(weekly.every(e => e.period === 'WEEKLY')).toBe(true)
    expect(weekly).toHaveLength(1)
  })

  it('should return an empty array when no entries match the period', () => {
    const all = rankEntries(raw)
    const allTime = filterByPeriod(all, 'ALL_TIME')
    expect(allTime).toHaveLength(0)
  })
})

describe('Leaderboard — prize eligibility', () => {
  it('should mark rank-1 customer eligible when prize exists and is unclaimed', () => {
    const ranked = rankEntries(raw.filter(e => e.period === 'MONTHLY'))
    const first = ranked.find(e => e.rank === 1)!
    expect(isPrizeEligible(first, prizes)).toBe(true)
  })

  it('should mark rank-2 customer ineligible when prize is already claimed', () => {
    const ranked = rankEntries(raw.filter(e => e.period === 'MONTHLY'))
    const second = ranked.find(e => e.rank === 2)!
    expect(isPrizeEligible(second, prizes)).toBe(false)
  })

  it('should return null from getPrize when the prize is already claimed', () => {
    expect(getPrize(2, 'MONTHLY', prizes)).toBeNull()
  })

  it('should return the correct prize object for an unclaimed rank', () => {
    const prize = getPrize(1, 'MONTHLY', prizes)
    expect(prize).not.toBeNull()
    expect(prize!.prize).toBe('$50 Gift Card')
  })
})

describe('Leaderboard — badge award for top 3', () => {
  it('should return exactly 3 entries for getTopThree when 3+ exist', () => {
    const ranked = rankEntries(raw.filter(e => e.period === 'MONTHLY'))
    expect(getTopThree(ranked)).toHaveLength(3)
  })

  it('should return entries sorted by rank ascending in getTopThree', () => {
    const ranked = rankEntries(raw.filter(e => e.period === 'MONTHLY'))
    const top3 = getTopThree(ranked)
    expect(top3[0].rank).toBe(1)
    expect(top3[1].rank).toBe(2)
    expect(top3[2].rank).toBe(3)
  })

  it('calcRankBadge rank 1 should return Crown label', () => {
    const badge = calcRankBadge(1)
    expect(badge.label).toBe('🥇 Champion')
    expect(badge.color).toContain('yellow')
  })

  it('calcRankBadge rank 2 should return silver label', () => {
    expect(calcRankBadge(2).label).toBe('🥈 Runner-up')
  })

  it('calcRankBadge rank 3 should return bronze label', () => {
    expect(calcRankBadge(3).label).toBe('🥉 Third Place')
  })

  it('calcRankBadge rank > 3 should return numbered label', () => {
    expect(calcRankBadge(4).label).toBe('#4')
    expect(calcRankBadge(10).label).toBe('#10')
  })
})
