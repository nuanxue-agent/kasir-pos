import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type PLCategory = 'REVENUE' | 'COGS' | 'OPEX' | 'OTHER_INCOME' | 'OTHER_EXPENSE'

interface PLAccount {
  id: string
  storeId: string
  code: string
  name: string
  category: PLCategory
  parentId: string | null
  active: number
}

interface PLEntry {
  id: string
  storeId: string
  accountId: string
  amount: number
  period: string
  description: string
}

interface PLAccountLine {
  accountId: string
  code: string
  name: string
  category: PLCategory
  parentId: string | null
  actual: number
  budget: number
  priorYear: number
}

interface PLSection {
  category: PLCategory
  label: string
  accounts: PLAccountLine[]
  total: number
  budgetTotal: number
  priorYearTotal: number
}

// ── Pure business-logic functions (mirrors API logic) ─────────────────────────

function buildSection(
  category: PLCategory,
  accounts: PLAccount[],
  actualEntries: PLEntry[],
  budgetEntries: PLEntry[],
  priorEntries: PLEntry[]
): PLSection {
  const catAccounts = accounts.filter(a => a.category === category && a.active === 1)

  const lines: PLAccountLine[] = catAccounts.map(a => ({
    accountId: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    parentId: a.parentId,
    actual: actualEntries.filter(e => e.accountId === a.id).reduce((s, e) => s + e.amount, 0),
    budget: budgetEntries.filter(e => e.accountId === a.id).reduce((s, e) => s + e.amount, 0),
    priorYear: priorEntries.filter(e => e.accountId === a.id).reduce((s, e) => s + e.amount, 0),
  }))

  const total = lines.reduce((s, l) => s + l.actual, 0)
  const budgetTotal = lines.reduce((s, l) => s + l.budget, 0)
  const priorYearTotal = lines.reduce((s, l) => s + l.priorYear, 0)

  return { category, label: category, accounts: lines, total, budgetTotal, priorYearTotal }
}

function calcGrossProfit(revTotal: number, cogsTotal: number) {
  return revTotal - cogsTotal
}

function calcEBITDA(grossProfit: number, opexTotal: number) {
  return grossProfit - opexTotal
}

function calcNetProfit(ebitda: number, otherIncome: number, otherExpense: number) {
  return ebitda + otherIncome - otherExpense
}

function calcGrossMarginPct(grossProfit: number, revenue: number): number {
  if (revenue === 0) return 0
  return (grossProfit / revenue) * 100
}

function calcNetMarginPct(netProfit: number, revenue: number): number {
  if (revenue === 0) return 0
  return (netProfit / revenue) * 100
}

function priorYearPeriod(period: string): string {
  const [y, m] = period.split('-')
  return `${Number(y) - 1}-${m}`
}

function aggregateHierarchy(
  accounts: PLAccount[],
  entries: PLEntry[],
  parentId: string | null = null
): number {
  const children = accounts.filter(a => a.parentId === parentId)
  return children.reduce((sum, child) => {
    const direct = entries
      .filter(e => e.accountId === child.id)
      .reduce((s, e) => s + e.amount, 0)
    const nested = aggregateHierarchy(accounts, entries, child.id)
    return sum + direct + nested
  }, 0)
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<PLAccount> & { id: string; category: PLCategory }): PLAccount {
  return {
    storeId: 'store-1',
    code: overrides.id,
    name: `Account ${overrides.id}`,
    parentId: null,
    active: 1,
    ...overrides,
  }
}

function makeEntry(overrides: Partial<PLEntry> & { accountId: string; amount: number }): PLEntry {
  return {
    id: `e-${Math.random()}`,
    storeId: 'store-1',
    period: '2025-01',
    description: '',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Gross profit calculation', () => {
  it('computes gross profit as revenue minus COGS', () => {
    const revenue = 100_000_000
    const cogs = 60_000_000
    expect(calcGrossProfit(revenue, cogs)).toBe(40_000_000)
  })

  it('returns negative gross profit when COGS exceeds revenue', () => {
    expect(calcGrossProfit(50_000_000, 70_000_000)).toBe(-20_000_000)
  })

  it('gross margin percent is zero when revenue is zero', () => {
    expect(calcGrossMarginPct(0, 0)).toBe(0)
  })

  it('gross margin percent is correct', () => {
    expect(calcGrossMarginPct(40_000_000, 100_000_000)).toBeCloseTo(40, 5)
  })
})

describe('EBITDA calculation', () => {
  it('computes EBITDA as gross profit minus OPEX', () => {
    const grossProfit = 40_000_000
    const opex = 15_000_000
    expect(calcEBITDA(grossProfit, opex)).toBe(25_000_000)
  })

  it('returns negative EBITDA when OPEX exceeds gross profit', () => {
    expect(calcEBITDA(10_000_000, 20_000_000)).toBe(-10_000_000)
  })
})

describe('Net profit calculation', () => {
  it('computes net profit as EBITDA + other income - other expense', () => {
    expect(calcNetProfit(25_000_000, 3_000_000, 1_000_000)).toBe(27_000_000)
  })

  it('net profit is zero when all inputs zero', () => {
    expect(calcNetProfit(0, 0, 0)).toBe(0)
  })

  it('net margin percent is correct', () => {
    expect(calcNetMarginPct(27_000_000, 100_000_000)).toBeCloseTo(27, 5)
  })
})

describe('Period comparison', () => {
  it('prior year period subtracts one year', () => {
    expect(priorYearPeriod('2025-01')).toBe('2024-01')
    expect(priorYearPeriod('2025-12')).toBe('2024-12')
  })

  it('section buildSection sums entries per account correctly', () => {
    const accounts: PLAccount[] = [
      makeAccount({ id: 'a1', category: 'REVENUE' }),
      makeAccount({ id: 'a2', category: 'REVENUE' }),
    ]
    const entries: PLEntry[] = [
      makeEntry({ accountId: 'a1', amount: 50_000_000 }),
      makeEntry({ accountId: 'a1', amount: 10_000_000 }),
      makeEntry({ accountId: 'a2', amount: 40_000_000 }),
    ]
    const section = buildSection('REVENUE', accounts, entries, [], [])
    expect(section.total).toBe(100_000_000)
    expect(section.accounts[0].actual).toBe(60_000_000)
    expect(section.accounts[1].actual).toBe(40_000_000)
  })

  it('budget column uses budgetEntries, not actualEntries', () => {
    const accounts: PLAccount[] = [makeAccount({ id: 'a1', category: 'OPEX' })]
    const actual: PLEntry[] = [makeEntry({ accountId: 'a1', amount: 5_000_000 })]
    const budget: PLEntry[] = [makeEntry({ accountId: 'a1', amount: 8_000_000 })]
    const section = buildSection('OPEX', accounts, actual, budget, [])
    expect(section.accounts[0].actual).toBe(5_000_000)
    expect(section.accounts[0].budget).toBe(8_000_000)
  })
})

describe('Account hierarchy aggregation', () => {
  it('sums direct entries for leaf accounts with no children', () => {
    const accounts: PLAccount[] = [
      makeAccount({ id: 'p1', category: 'OPEX', parentId: null }),
    ]
    const entries: PLEntry[] = [
      makeEntry({ accountId: 'p1', amount: 3_000_000 }),
      makeEntry({ accountId: 'p1', amount: 2_000_000 }),
    ]
    expect(aggregateHierarchy(accounts, entries, null)).toBe(5_000_000)
  })

  it('aggregates child accounts under a parent', () => {
    const accounts: PLAccount[] = [
      makeAccount({ id: 'parent', category: 'OPEX', parentId: null }),
      makeAccount({ id: 'child1', category: 'OPEX', parentId: 'parent' }),
      makeAccount({ id: 'child2', category: 'OPEX', parentId: 'parent' }),
    ]
    const entries: PLEntry[] = [
      makeEntry({ accountId: 'parent', amount: 1_000_000 }),
      makeEntry({ accountId: 'child1', amount: 2_000_000 }),
      makeEntry({ accountId: 'child2', amount: 3_000_000 }),
    ]
    expect(aggregateHierarchy(accounts, entries, null)).toBe(6_000_000)
  })

  it('inactive accounts are excluded from buildSection', () => {
    const accounts: PLAccount[] = [
      makeAccount({ id: 'active', category: 'REVENUE', active: 1 }),
      makeAccount({ id: 'inactive', category: 'REVENUE', active: 0 }),
    ]
    const entries: PLEntry[] = [
      makeEntry({ accountId: 'active', amount: 10_000_000 }),
      makeEntry({ accountId: 'inactive', amount: 5_000_000 }),
    ]
    const section = buildSection('REVENUE', accounts, entries, [], [])
    expect(section.total).toBe(10_000_000)
    expect(section.accounts.length).toBe(1)
  })
})
