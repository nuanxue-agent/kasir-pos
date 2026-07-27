import { describe, it, expect } from 'vitest'
import {
  buildCohortMatrix,
  calcPriceImpact,
  buildPriceSensitivity,
  heatmapMax,
  heatmapOpacity,
  retentionColor,
  type CohortRow,
  type HeatmapCell,
} from '@/components/reports/BusinessIntelligenceClient'
import {
  isReportDue,
  nextSendDate,
  validateEmails,
} from '@/components/settings/ScheduledReportsClient'

// ── Cohort retention ──────────────────────────────────────────────────────────

describe('buildCohortMatrix', () => {
  it('rounds retention values to 1 decimal place', () => {
    const rows: CohortRow[] = [
      { cohort: '2024-01', customers: 100, retention: [100, 33.333, 16.6666] },
    ]
    const result = buildCohortMatrix(rows)
    expect(result[0].retention).toEqual([100, 33.3, 16.7])
  })

  it('preserves cohort and customers unchanged', () => {
    const rows: CohortRow[] = [
      { cohort: '2024-03', customers: 42, retention: [100, 50] },
    ]
    const result = buildCohortMatrix(rows)
    expect(result[0].cohort).toBe('2024-03')
    expect(result[0].customers).toBe(42)
  })

  it('handles empty retention array', () => {
    const rows: CohortRow[] = [{ cohort: '2024-05', customers: 10, retention: [] }]
    expect(buildCohortMatrix(rows)[0].retention).toEqual([])
  })

  it('handles zero retention values', () => {
    const rows: CohortRow[] = [{ cohort: '2024-02', customers: 50, retention: [100, 0, 0, 0] }]
    expect(buildCohortMatrix(rows)[0].retention).toEqual([100, 0, 0, 0])
  })
})

// ── Heatmap aggregation ───────────────────────────────────────────────────────

describe('heatmapMax', () => {
  it('returns the max orderCount across all cells', () => {
    const cells: HeatmapCell[] = [
      { hour: 9, dayOfWeek: 1, orderCount: 5, revenue: 100 },
      { hour: 12, dayOfWeek: 1, orderCount: 20, revenue: 400 },
      { hour: 18, dayOfWeek: 5, orderCount: 15, revenue: 300 },
    ]
    expect(heatmapMax(cells)).toBe(20)
  })

  it('returns 1 for empty cells (avoid divide-by-zero)', () => {
    expect(heatmapMax([])).toBe(1)
  })
})

describe('heatmapOpacity', () => {
  it('returns 0 when max is 0', () => {
    expect(heatmapOpacity(5, 0)).toBe(0)
  })

  it('returns 1.0 when count equals max', () => {
    expect(heatmapOpacity(10, 10)).toBe(1)
  })

  it('returns 0.5 for half of max', () => {
    expect(heatmapOpacity(5, 10)).toBe(0.5)
  })

  it('rounds to 1 decimal place', () => {
    expect(heatmapOpacity(3, 7)).toBe(0.4)
  })
})

// ── Price sensitivity ─────────────────────────────────────────────────────────

describe('calcPriceImpact', () => {
  it('returns base revenue when changePct is 0', () => {
    expect(calcPriceImpact(10000, 100, 0)).toBe(10000)
  })

  it('+5% price change reduces net revenue slightly (elasticity = -1)', () => {
    // price * 1.05, demand * 0.95 → net revenue = base * 0.9975
    const result = calcPriceImpact(10000, 100, 5)
    expect(result).toBe(9975)
  })

  it('-10% price change reduces net revenue (1 * 0.9 * 1.1 = 0.99)', () => {
    const result = calcPriceImpact(10000, 100, -10)
    expect(result).toBe(9900)
  })

  it('builds full sensitivity row with all 6 deltas', () => {
    const rows = buildPriceSensitivity([
      { productId: 'p1', name: 'Widget', baseRevenue: 10000, basePriceAvg: 100, qtySold: 100 },
    ])
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.impact).toHaveProperty('minus15')
    expect(row.impact).toHaveProperty('minus10')
    expect(row.impact).toHaveProperty('minus5')
    expect(row.impact).toHaveProperty('plus5')
    expect(row.impact).toHaveProperty('plus10')
    expect(row.impact).toHaveProperty('plus15')
  })
})

describe('retentionColor', () => {
  it('returns emerald class for high retention (≥70%)', () => {
    expect(retentionColor(70)).toContain('emerald-500')
    expect(retentionColor(100)).toContain('emerald-500')
  })

  it('returns muted class for zero retention', () => {
    expect(retentionColor(0)).toContain('bg-[var(--bg-card)]')
  })
})

// ── Scheduled report frequency logic ─────────────────────────────────────────

describe('isReportDue', () => {
  const now = new Date('2024-06-15T12:00:00Z')

  it('is due when lastSentAt is null', () => {
    expect(isReportDue('weekly', null, now)).toBe(true)
    expect(isReportDue('monthly', null, now)).toBe(true)
  })

  it('weekly report is due after 7 days', () => {
    const last = new Date('2024-06-08T12:00:00Z').toISOString()
    expect(isReportDue('weekly', last, now)).toBe(true)
  })

  it('weekly report is NOT due if sent less than 7 days ago', () => {
    const last = new Date('2024-06-10T12:00:00Z').toISOString()
    expect(isReportDue('weekly', last, now)).toBe(false)
  })

  it('monthly report is due after 30 days', () => {
    const last = new Date('2024-05-15T12:00:00Z').toISOString()
    expect(isReportDue('monthly', last, now)).toBe(true)
  })

  it('monthly report is NOT due if sent 15 days ago', () => {
    const last = new Date('2024-06-01T12:00:00Z').toISOString()
    expect(isReportDue('monthly', last, now)).toBe(false)
  })
})

describe('nextSendDate', () => {
  const now = new Date('2024-06-15T00:00:00Z')

  it('returns now when lastSentAt is null', () => {
    expect(nextSendDate('weekly', null, now)).toEqual(now)
  })

  it('weekly: next date is 7 days after lastSentAt', () => {
    const last = new Date('2024-06-10T00:00:00Z').toISOString()
    const next = nextSendDate('weekly', last, now)
    expect(next.toISOString().slice(0, 10)).toBe('2024-06-17')
  })

  it('monthly: next date is 30 days after lastSentAt', () => {
    const last = new Date('2024-06-01T00:00:00Z').toISOString()
    const next = nextSendDate('monthly', last, now)
    expect(next.toISOString().slice(0, 10)).toBe('2024-07-01')
  })
})

describe('validateEmails', () => {
  it('returns empty array for valid emails', () => {
    expect(validateEmails(['alice@example.com', 'bob@test.org'])).toEqual([])
  })

  it('returns invalid emails', () => {
    expect(validateEmails(['notanemail', 'alice@example.com'])).toEqual(['notanemail'])
  })

  it('handles empty input', () => {
    expect(validateEmails([])).toEqual([])
  })
})
