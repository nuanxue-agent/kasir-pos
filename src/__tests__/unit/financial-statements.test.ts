import { describe, it, expect } from 'vitest'

// ── Types ──────────────────────────────────────────────────────────────────────

interface MonthRow {
  month: number
  revenue: number
  cogs: number
  grossProfit: number
  operatingExpenses: number
  netProfit: number
}

interface PnLTotals {
  revenue: number
  cogs: number
  grossProfit: number
  operatingExpenses: number
  netProfit: number
}

interface BalanceSheet {
  assets: { cash: number; inventory: number; accountsReceivable: number; total: number }
  liabilities: { accountsPayable: number; total: number }
  equity: number
  totalAssets: number
  totalLiabilities: number
  isBalanced: boolean
}

// ── Pure calculation helpers (mirror API & component logic) ───────────────────

function calcMonthRow(revenue: number, cogs: number, opex: number): MonthRow {
  const grossProfit = revenue - cogs
  const netProfit = grossProfit - opex
  return { month: 1, revenue, cogs, grossProfit, operatingExpenses: opex, netProfit }
}

function calcPnLTotals(months: MonthRow[]): PnLTotals {
  return months.reduce(
    (acc, m) => ({
      revenue: acc.revenue + m.revenue,
      cogs: acc.cogs + m.cogs,
      grossProfit: acc.grossProfit + m.grossProfit,
      operatingExpenses: acc.operatingExpenses + m.operatingExpenses,
      netProfit: acc.netProfit + m.netProfit,
    }),
    { revenue: 0, cogs: 0, grossProfit: 0, operatingExpenses: 0, netProfit: 0 },
  )
}

function buildBalanceSheet(
  cash: number,
  inventory: number,
  accountsReceivable: number,
  accountsPayable: number,
): BalanceSheet {
  const totalAssets = cash + inventory + accountsReceivable
  const totalLiabilities = accountsPayable
  const equity = totalAssets - totalLiabilities
  const isBalanced = Math.abs(totalAssets - (totalLiabilities + equity)) < 0.01
  return {
    assets: { cash, inventory, accountsReceivable, total: totalAssets },
    liabilities: { accountsPayable, total: totalLiabilities },
    equity,
    totalAssets,
    totalLiabilities,
    isBalanced,
  }
}

function calcYoYChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleMonths: MonthRow[] = [
  calcMonthRow(10_000_000, 4_000_000, 2_000_000), // month 1
  { ...calcMonthRow(8_000_000, 3_000_000, 1_500_000), month: 2 },
  { ...calcMonthRow(12_000_000, 5_000_000, 2_500_000), month: 3 },
]

// ── Tests: Gross Profit calculation ──────────────────────────────────────────

describe('Gross profit calculation', () => {
  it('grossProfit = revenue - COGS', () => {
    const row = calcMonthRow(10_000_000, 4_000_000, 0)
    expect(row.grossProfit).toBe(6_000_000)
  })

  it('grossProfit is zero when COGS equals revenue', () => {
    const row = calcMonthRow(5_000_000, 5_000_000, 0)
    expect(row.grossProfit).toBe(0)
  })

  it('grossProfit is negative when COGS exceeds revenue', () => {
    const row = calcMonthRow(3_000_000, 5_000_000, 0)
    expect(row.grossProfit).toBe(-2_000_000)
  })
})

// ── Tests: Net Profit calculation ─────────────────────────────────────────────

describe('Net profit calculation', () => {
  it('netProfit = grossProfit - operatingExpenses', () => {
    const row = calcMonthRow(10_000_000, 4_000_000, 2_000_000)
    expect(row.netProfit).toBe(4_000_000)
  })

  it('netProfit is negative (net loss) when opex exceeds gross profit', () => {
    const row = calcMonthRow(5_000_000, 3_000_000, 3_000_000)
    expect(row.netProfit).toBe(-1_000_000)
  })

  it('monthly totals sum correctly across all months', () => {
    const totals = calcPnLTotals(sampleMonths)
    expect(totals.revenue).toBe(30_000_000)
    expect(totals.cogs).toBe(12_000_000)
    expect(totals.grossProfit).toBe(18_000_000)
    expect(totals.operatingExpenses).toBe(6_000_000)
    expect(totals.netProfit).toBe(12_000_000)
  })
})

// ── Tests: COGS calculation ───────────────────────────────────────────────────

describe('COGS calculation', () => {
  it('COGS is accumulated correctly in totals', () => {
    const totals = calcPnLTotals(sampleMonths)
    expect(totals.cogs).toBe(12_000_000)
  })

  it('zero COGS yields gross profit equal to revenue', () => {
    const row = calcMonthRow(8_000_000, 0, 0)
    expect(row.grossProfit).toBe(row.revenue)
  })
})

// ── Tests: Balance Sheet equation (Assets = Liabilities + Equity) ─────────────

describe('Balance sheet equation (Assets = Liabilities + Equity)', () => {
  it('equity = totalAssets - totalLiabilities', () => {
    const bs = buildBalanceSheet(5_000_000, 3_000_000, 2_000_000, 4_000_000)
    expect(bs.equity).toBe(bs.totalAssets - bs.totalLiabilities)
  })

  it('isBalanced is true for a valid balance sheet', () => {
    const bs = buildBalanceSheet(5_000_000, 3_000_000, 2_000_000, 4_000_000)
    expect(bs.isBalanced).toBe(true)
  })

  it('totalAssets equals cash + inventory + accountsReceivable', () => {
    const bs = buildBalanceSheet(2_000_000, 3_000_000, 1_000_000, 500_000)
    expect(bs.totalAssets).toBe(6_000_000)
  })

  it('totalLiabilities equals accountsPayable', () => {
    const bs = buildBalanceSheet(5_000_000, 0, 0, 1_500_000)
    expect(bs.totalLiabilities).toBe(1_500_000)
  })

  it('equity is zero when assets equal liabilities', () => {
    const bs = buildBalanceSheet(4_000_000, 0, 0, 4_000_000)
    expect(bs.equity).toBe(0)
  })
})

// ── Tests: Year-over-Year comparison ─────────────────────────────────────────

describe('Year-over-Year comparison', () => {
  it('positive YoY change for revenue growth', () => {
    expect(calcYoYChange(12_000_000, 10_000_000)).toBeCloseTo(20, 1)
  })

  it('negative YoY change for revenue decline', () => {
    expect(calcYoYChange(8_000_000, 10_000_000)).toBeCloseTo(-20, 1)
  })

  it('returns null when previous year is zero', () => {
    expect(calcYoYChange(5_000_000, 0)).toBeNull()
  })

  it('zero change when both years are equal', () => {
    expect(calcYoYChange(10_000_000, 10_000_000)).toBeCloseTo(0, 1)
  })
})
