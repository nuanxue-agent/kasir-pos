import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type CashFlowCategory = 'OPERATING' | 'INVESTING' | 'FINANCING'
type CashFlowType = 'INFLOW' | 'OUTFLOW'

interface CashFlowEntry {
  id: string
  storeId: string
  category: CashFlowCategory
  type: CashFlowType
  description: string
  amount: number
  period: string
  reference: string | null
}

interface CashFlowEntryRow {
  id: string
  description: string
  amount: number
  reference: string | null
}

interface CashFlowSection {
  category: CashFlowCategory
  label: string
  inflows: CashFlowEntryRow[]
  outflows: CashFlowEntryRow[]
  totalInflow: number
  totalOutflow: number
  net: number
}

// ── Pure business-logic functions (mirrors API logic) ─────────────────────────

function buildSection(category: CashFlowCategory, entries: CashFlowEntry[]): CashFlowSection {
  const catEntries = entries.filter(e => e.category === category)
  const inflows = catEntries
    .filter(e => e.type === 'INFLOW')
    .map(e => ({ id: e.id, description: e.description, amount: e.amount, reference: e.reference }))
  const outflows = catEntries
    .filter(e => e.type === 'OUTFLOW')
    .map(e => ({ id: e.id, description: e.description, amount: e.amount, reference: e.reference }))
  const totalInflow = inflows.reduce((s, e) => s + e.amount, 0)
  const totalOutflow = outflows.reduce((s, e) => s + e.amount, 0)
  return {
    category,
    label: category,
    inflows,
    outflows,
    totalInflow,
    totalOutflow,
    net: totalInflow - totalOutflow,
  }
}

function calcNetCashChange(
  operatingNet: number,
  investingNet: number,
  financingNet: number,
): number {
  return operatingNet + investingNet + financingNet
}

function calcClosingBalance(openingBalance: number, netCashChange: number): number {
  return openingBalance + netCashChange
}

function filterByPeriod(entries: CashFlowEntry[], period: string): CashFlowEntry[] {
  return entries.filter(e => e.period === period)
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEntry(
  overrides: Partial<CashFlowEntry> & {
    category: CashFlowCategory
    type: CashFlowType
    amount: number
  }
): CashFlowEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    storeId: 'store-1',
    description: 'Test entry',
    period: '2025-01',
    reference: null,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Operating cash flow', () => {
  it('sums inflows and outflows correctly', () => {
    const entries = [
      makeEntry({ category: 'OPERATING', type: 'INFLOW', amount: 100_000_000 }),
      makeEntry({ category: 'OPERATING', type: 'INFLOW', amount: 50_000_000 }),
      makeEntry({ category: 'OPERATING', type: 'OUTFLOW', amount: 30_000_000 }),
    ]
    const section = buildSection('OPERATING', entries)
    expect(section.totalInflow).toBe(150_000_000)
    expect(section.totalOutflow).toBe(30_000_000)
    expect(section.net).toBe(120_000_000)
  })

  it('returns net zero when no entries', () => {
    const section = buildSection('OPERATING', [])
    expect(section.net).toBe(0)
    expect(section.totalInflow).toBe(0)
    expect(section.totalOutflow).toBe(0)
  })

  it('net is negative when outflows exceed inflows', () => {
    const entries = [
      makeEntry({ category: 'OPERATING', type: 'INFLOW', amount: 10_000_000 }),
      makeEntry({ category: 'OPERATING', type: 'OUTFLOW', amount: 25_000_000 }),
    ]
    const section = buildSection('OPERATING', entries)
    expect(section.net).toBe(-15_000_000)
  })
})

describe('Investing cash flow', () => {
  it('sums investing entries independently of other categories', () => {
    const entries = [
      makeEntry({ category: 'INVESTING', type: 'INFLOW', amount: 200_000_000, description: 'Asset sale' }),
      makeEntry({ category: 'INVESTING', type: 'OUTFLOW', amount: 500_000_000, description: 'Equipment purchase' }),
      makeEntry({ category: 'OPERATING', type: 'INFLOW', amount: 999_000_000 }), // should be excluded
    ]
    const section = buildSection('INVESTING', entries)
    expect(section.totalInflow).toBe(200_000_000)
    expect(section.totalOutflow).toBe(500_000_000)
    expect(section.net).toBe(-300_000_000)
    expect(section.inflows).toHaveLength(1)
    expect(section.outflows).toHaveLength(1)
  })

  it('only includes INVESTING category entries', () => {
    const entries = [
      makeEntry({ category: 'OPERATING', type: 'INFLOW', amount: 50_000_000 }),
      makeEntry({ category: 'FINANCING', type: 'INFLOW', amount: 80_000_000 }),
    ]
    const section = buildSection('INVESTING', entries)
    expect(section.inflows).toHaveLength(0)
    expect(section.outflows).toHaveLength(0)
    expect(section.net).toBe(0)
  })
})

describe('Financing cash flow', () => {
  it('sums financing inflows and outflows correctly', () => {
    const entries = [
      makeEntry({ category: 'FINANCING', type: 'INFLOW', amount: 300_000_000, description: 'Bank loan' }),
      makeEntry({ category: 'FINANCING', type: 'OUTFLOW', amount: 50_000_000, description: 'Loan repayment' }),
      makeEntry({ category: 'FINANCING', type: 'OUTFLOW', amount: 20_000_000, description: 'Dividend payment' }),
    ]
    const section = buildSection('FINANCING', entries)
    expect(section.totalInflow).toBe(300_000_000)
    expect(section.totalOutflow).toBe(70_000_000)
    expect(section.net).toBe(230_000_000)
    expect(section.outflows).toHaveLength(2)
  })
})

describe('Net cash calculation', () => {
  it('sums operating + investing + financing nets', () => {
    expect(calcNetCashChange(120_000_000, -300_000_000, 230_000_000)).toBe(50_000_000)
  })

  it('returns zero when all nets are zero', () => {
    expect(calcNetCashChange(0, 0, 0)).toBe(0)
  })

  it('correctly computes closing balance from opening + net change', () => {
    expect(calcClosingBalance(500_000_000, 50_000_000)).toBe(550_000_000)
  })

  it('closing balance decreases when net change is negative', () => {
    expect(calcClosingBalance(500_000_000, -150_000_000)).toBe(350_000_000)
  })
})

describe('Period filtering', () => {
  it('filters entries to the requested period only', () => {
    const entries = [
      makeEntry({ category: 'OPERATING', type: 'INFLOW', amount: 100_000_000, period: '2025-01' }),
      makeEntry({ category: 'OPERATING', type: 'INFLOW', amount: 200_000_000, period: '2025-02' }),
      makeEntry({ category: 'INVESTING', type: 'OUTFLOW', amount: 50_000_000, period: '2025-01' }),
    ]
    const jan = filterByPeriod(entries, '2025-01')
    expect(jan).toHaveLength(2)
    expect(jan.every(e => e.period === '2025-01')).toBe(true)
  })

  it('returns empty array when no entries match period', () => {
    const entries = [
      makeEntry({ category: 'OPERATING', type: 'INFLOW', amount: 100_000_000, period: '2025-01' }),
    ]
    const result = filterByPeriod(entries, '2025-03')
    expect(result).toHaveLength(0)
  })

  it('section totals reflect only filtered-period entries', () => {
    const allEntries = [
      makeEntry({ category: 'OPERATING', type: 'INFLOW', amount: 100_000_000, period: '2025-01' }),
      makeEntry({ category: 'OPERATING', type: 'INFLOW', amount: 999_000_000, period: '2025-02' }),
    ]
    const filtered = filterByPeriod(allEntries, '2025-01')
    const section = buildSection('OPERATING', filtered)
    expect(section.totalInflow).toBe(100_000_000)
  })
})
