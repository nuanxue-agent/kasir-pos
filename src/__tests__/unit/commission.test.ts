import { describe, it, expect } from 'vitest'

// ── Commission engine — pure business logic ────────────────────────────────────

type CommissionType = 'PERCENTAGE' | 'FLAT' | 'TIERED'

interface Tier {
  upTo: number | null  // null = unlimited / highest band
  rate: number         // percentage
}

interface CommissionRule {
  type: CommissionType
  value: number        // % for PERCENTAGE, Rp per order for FLAT, ignored for TIERED
  tiers?: Tier[]
}

interface EmployeeSales {
  employeeId: string
  name: string
  ordersClosed: number
  totalSales: number
}

/** Calculate commission earned for a single employee */
function calcCommission(sales: EmployeeSales, rule: CommissionRule): number {
  if (rule.type === 'PERCENTAGE') {
    return Math.round((sales.totalSales * rule.value) / 100)
  }
  if (rule.type === 'FLAT') {
    return Math.round(rule.value * sales.ordersClosed)
  }
  if (rule.type === 'TIERED' && rule.tiers && rule.tiers.length > 0) {
    const tiers = rule.tiers
    let remaining = sales.totalSales
    let commission = 0
    let prevThreshold = 0
    for (const tier of tiers) {
      if (remaining <= 0) break
      const ceiling = tier.upTo === null ? Infinity : tier.upTo
      const band = Math.min(remaining, ceiling - prevThreshold)
      if (band > 0) {
        commission += (band * tier.rate) / 100
        remaining -= band
      }
      if (tier.upTo !== null) prevThreshold = tier.upTo
    }
    return Math.round(commission)
  }
  return 0
}

/** Build leaderboard: sort by totalSales descending, return top N */
function buildLeaderboard(data: EmployeeSales[], topN = 5): EmployeeSales[] {
  return [...data].sort((a, b) => b.totalSales - a.totalSales).slice(0, topN)
}

/** Get the start and end date strings for a given month/year period */
function getPeriodRange(month: number, year: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** Resolve which rule applies: employee-specific wins over store-wide fallback */
function resolveRule(
  employeeId: string,
  rules: Array<CommissionRule & { employeeId?: string | null }>,
): CommissionRule | null {
  return (
    rules.find(r => r.employeeId === employeeId) ??
    rules.find(r => !r.employeeId) ??
    null
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Percentage commission calculation', () => {
  it('calculates 5% of total sales', () => {
    const rule: CommissionRule = { type: 'PERCENTAGE', value: 5 }
    const sales: EmployeeSales = { employeeId: 'e1', name: 'Budi', ordersClosed: 10, totalSales: 10_000_000 }
    expect(calcCommission(sales, rule)).toBe(500_000)
  })

  it('calculates 2.5% and rounds to nearest integer', () => {
    const rule: CommissionRule = { type: 'PERCENTAGE', value: 2.5 }
    const sales: EmployeeSales = { employeeId: 'e1', name: 'Ani', ordersClosed: 5, totalSales: 3_000_001 }
    // 3_000_001 * 2.5 / 100 = 75_000.025 → rounds to 75_000
    expect(calcCommission(sales, rule)).toBe(75_000)
  })

  it('returns 0 for zero sales', () => {
    const rule: CommissionRule = { type: 'PERCENTAGE', value: 10 }
    const sales: EmployeeSales = { employeeId: 'e2', name: 'Caca', ordersClosed: 0, totalSales: 0 }
    expect(calcCommission(sales, rule)).toBe(0)
  })
})

describe('Flat commission calculation', () => {
  it('calculates flat Rp 50k per order', () => {
    const rule: CommissionRule = { type: 'FLAT', value: 50_000 }
    const sales: EmployeeSales = { employeeId: 'e1', name: 'Deni', ordersClosed: 20, totalSales: 5_000_000 }
    expect(calcCommission(sales, rule)).toBe(1_000_000)
  })

  it('returns 0 when no orders closed', () => {
    const rule: CommissionRule = { type: 'FLAT', value: 75_000 }
    const sales: EmployeeSales = { employeeId: 'e1', name: 'Eka', ordersClosed: 0, totalSales: 0 }
    expect(calcCommission(sales, rule)).toBe(0)
  })
})

describe('Tiered commission threshold logic', () => {
  const tieredRule: CommissionRule = {
    type: 'TIERED',
    value: 0,
    tiers: [
      { upTo: 10_000_000, rate: 2 },  // 2% on first 10M
      { upTo: null, rate: 3 },         // 3% on anything above 10M
    ],
  }

  it('applies 2% when sales are below 10M threshold', () => {
    const sales: EmployeeSales = { employeeId: 'e1', name: 'Fajar', ordersClosed: 5, totalSales: 5_000_000 }
    // 5M * 2% = 100K
    expect(calcCommission(sales, tieredRule)).toBe(100_000)
  })

  it('applies tiered rate correctly when crossing 10M threshold', () => {
    const sales: EmployeeSales = { employeeId: 'e1', name: 'Gita', ordersClosed: 15, totalSales: 15_000_000 }
    // First 10M * 2% = 200K, next 5M * 3% = 150K → total 350K
    expect(calcCommission(sales, tieredRule)).toBe(350_000)
  })

  it('applies only top tier when sales exceed all thresholds', () => {
    const sales: EmployeeSales = { employeeId: 'e1', name: 'Hadi', ordersClosed: 30, totalSales: 25_000_000 }
    // First 10M * 2% = 200K, remaining 15M * 3% = 450K → total 650K
    expect(calcCommission(sales, tieredRule)).toBe(650_000)
  })

  it('handles exactly at threshold boundary', () => {
    const sales: EmployeeSales = { employeeId: 'e1', name: 'Indra', ordersClosed: 10, totalSales: 10_000_000 }
    // Exactly 10M: 10M * 2% = 200K, 0 for second tier
    expect(calcCommission(sales, tieredRule)).toBe(200_000)
  })
})

describe('Leaderboard ranking', () => {
  const salesData: EmployeeSales[] = [
    { employeeId: 'e1', name: 'Alice', ordersClosed: 10, totalSales: 5_000_000 },
    { employeeId: 'e2', name: 'Bob', ordersClosed: 20, totalSales: 15_000_000 },
    { employeeId: 'e3', name: 'Carol', ordersClosed: 8, totalSales: 3_000_000 },
    { employeeId: 'e4', name: 'Dave', ordersClosed: 25, totalSales: 20_000_000 },
    { employeeId: 'e5', name: 'Eve', ordersClosed: 12, totalSales: 8_000_000 },
    { employeeId: 'e6', name: 'Frank', ordersClosed: 5, totalSales: 2_000_000 },
  ]

  it('returns top 5 sorted by totalSales descending', () => {
    const board = buildLeaderboard(salesData)
    expect(board).toHaveLength(5)
    expect(board[0].name).toBe('Dave')
    expect(board[1].name).toBe('Bob')
    expect(board[2].name).toBe('Eve')
  })

  it('does not include rank 6 in top 5', () => {
    const board = buildLeaderboard(salesData)
    const names = board.map(e => e.name)
    expect(names).not.toContain('Frank')
  })

  it('does not mutate original array', () => {
    const originalOrder = salesData.map(e => e.name)
    buildLeaderboard(salesData)
    expect(salesData.map(e => e.name)).toEqual(originalOrder)
  })
})

describe('Period date range', () => {
  it('returns correct start and end for January 2025', () => {
    const range = getPeriodRange(1, 2025)
    expect(range.start).toBe('2025-01-01')
    expect(range.end).toBe('2025-01-31')
  })

  it('returns correct end for February in a leap year', () => {
    const range = getPeriodRange(2, 2024)
    expect(range.end).toBe('2024-02-29')
  })

  it('returns correct end for February in a non-leap year', () => {
    const range = getPeriodRange(2, 2025)
    expect(range.end).toBe('2025-02-28')
  })

  it('returns correct end for December', () => {
    const range = getPeriodRange(12, 2025)
    expect(range.start).toBe('2025-12-01')
    expect(range.end).toBe('2025-12-31')
  })
})
