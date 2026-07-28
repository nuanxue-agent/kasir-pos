import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type BSCategory =
  | 'CURRENT_ASSET'
  | 'FIXED_ASSET'
  | 'CURRENT_LIABILITY'
  | 'LONG_TERM_LIABILITY'
  | 'EQUITY'

interface BSAccount {
  id: string
  storeId: string
  code: string
  name: string
  category: BSCategory
  parentId: string | null
  active: number
}

interface BSEntry {
  accountId: string
  amount: number
}

interface BSAccountLine {
  accountId: string
  code: string
  name: string
  category: BSCategory
  parentId: string | null
  amount: number
}

interface BSSection {
  category: BSCategory
  label: string
  accounts: BSAccountLine[]
  total: number
}

// ── Pure business-logic functions (mirrors API logic) ─────────────────────────

function buildBSSection(
  category: BSCategory,
  accounts: BSAccount[],
  entries: BSEntry[]
): BSSection {
  const catAccounts = accounts.filter(a => a.category === category && a.active === 1)

  const lines: BSAccountLine[] = catAccounts.map(a => ({
    accountId: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    parentId: a.parentId,
    amount: entries
      .filter(e => e.accountId === a.id)
      .reduce((s, e) => s + e.amount, 0),
  }))

  const total = lines.reduce((s, l) => s + l.amount, 0)
  return { category, label: category, accounts: lines, total }
}

function calcTotalAssets(currentAssets: BSSection, fixedAssets: BSSection): number {
  return currentAssets.total + fixedAssets.total
}

function calcTotalLiabilities(
  currentLiabilities: BSSection,
  longTermLiabilities: BSSection
): number {
  return currentLiabilities.total + longTermLiabilities.total
}

function calcTotalLiabilitiesAndEquity(
  totalLiabilities: number,
  equityTotal: number
): number {
  return totalLiabilities + equityTotal
}

function isBalanced(totalAssets: number, totalLiabilitiesAndEquity: number): boolean {
  return Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01
}

function aggregateByCategory(
  accounts: BSAccount[],
  entries: BSEntry[]
): Record<BSCategory, number> {
  const result: Record<BSCategory, number> = {
    CURRENT_ASSET: 0,
    FIXED_ASSET: 0,
    CURRENT_LIABILITY: 0,
    LONG_TERM_LIABILITY: 0,
    EQUITY: 0,
  }
  for (const acc of accounts) {
    if (acc.active !== 1) continue
    const sum = entries
      .filter(e => e.accountId === acc.id)
      .reduce((s, e) => s + e.amount, 0)
    result[acc.category] += sum
  }
  return result
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STORE = 'store-1'

const accounts: BSAccount[] = [
  { id: 'a1', storeId: STORE, code: '1101', name: 'Kas', category: 'CURRENT_ASSET', parentId: null, active: 1 },
  { id: 'a2', storeId: STORE, code: '1102', name: 'Piutang', category: 'CURRENT_ASSET', parentId: null, active: 1 },
  { id: 'a3', storeId: STORE, code: '1201', name: 'Mesin', category: 'FIXED_ASSET', parentId: null, active: 1 },
  { id: 'a4', storeId: STORE, code: '1202', name: 'Kendaraan', category: 'FIXED_ASSET', parentId: null, active: 0 }, // inactive
  { id: 'a5', storeId: STORE, code: '2101', name: 'Utang Usaha', category: 'CURRENT_LIABILITY', parentId: null, active: 1 },
  { id: 'a6', storeId: STORE, code: '2201', name: 'Utang Bank', category: 'LONG_TERM_LIABILITY', parentId: null, active: 1 },
  { id: 'a7', storeId: STORE, code: '3101', name: 'Modal', category: 'EQUITY', parentId: null, active: 1 },
  { id: 'a8', storeId: STORE, code: '3102', name: 'Laba Ditahan', category: 'EQUITY', parentId: null, active: 1 },
]

const entries: BSEntry[] = [
  { accountId: 'a1', amount: 5_000_000 },
  { accountId: 'a2', amount: 3_000_000 },
  { accountId: 'a3', amount: 20_000_000 },
  { accountId: 'a4', amount: 10_000_000 }, // inactive account — should be excluded
  { accountId: 'a5', amount: 4_000_000 },
  { accountId: 'a6', amount: 12_000_000 },
  { accountId: 'a7', amount: 10_000_000 },
  { accountId: 'a8', amount: 2_000_000 },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Balance Sheet — Assets', () => {
  it('calculates current assets total correctly', () => {
    const section = buildBSSection('CURRENT_ASSET', accounts, entries)
    expect(section.total).toBe(8_000_000) // 5M + 3M
  })

  it('calculates fixed assets total correctly', () => {
    const section = buildBSSection('FIXED_ASSET', accounts, entries)
    // a4 is inactive → excluded; only a3 = 20M
    expect(section.total).toBe(20_000_000)
  })

  it('excludes inactive accounts from asset sections', () => {
    const section = buildBSSection('FIXED_ASSET', accounts, entries)
    const ids = section.accounts.map(a => a.accountId)
    expect(ids).not.toContain('a4')
  })

  it('calculates total assets as current + fixed', () => {
    const ca = buildBSSection('CURRENT_ASSET', accounts, entries)
    const fa = buildBSSection('FIXED_ASSET', accounts, entries)
    expect(calcTotalAssets(ca, fa)).toBe(28_000_000) // 8M + 20M
  })
})

describe('Balance Sheet — Liabilities', () => {
  it('calculates current liabilities total correctly', () => {
    const section = buildBSSection('CURRENT_LIABILITY', accounts, entries)
    expect(section.total).toBe(4_000_000)
  })

  it('calculates long-term liabilities total correctly', () => {
    const section = buildBSSection('LONG_TERM_LIABILITY', accounts, entries)
    expect(section.total).toBe(12_000_000)
  })

  it('calculates total liabilities as current + long-term', () => {
    const cl = buildBSSection('CURRENT_LIABILITY', accounts, entries)
    const ll = buildBSSection('LONG_TERM_LIABILITY', accounts, entries)
    expect(calcTotalLiabilities(cl, ll)).toBe(16_000_000) // 4M + 12M
  })
})

describe('Balance Sheet — Equity', () => {
  it('calculates equity total correctly', () => {
    const section = buildBSSection('EQUITY', accounts, entries)
    expect(section.total).toBe(12_000_000) // 10M + 2M
  })

  it('calculates total liabilities + equity', () => {
    const cl = buildBSSection('CURRENT_LIABILITY', accounts, entries)
    const ll = buildBSSection('LONG_TERM_LIABILITY', accounts, entries)
    const eq = buildBSSection('EQUITY', accounts, entries)
    const totalL = calcTotalLiabilities(cl, ll)
    expect(calcTotalLiabilitiesAndEquity(totalL, eq.total)).toBe(28_000_000) // 16M + 12M
  })
})

describe('Balance Sheet — Balance Equation (A = L + E)', () => {
  it('balance equation holds when assets equal liabilities + equity', () => {
    const ca = buildBSSection('CURRENT_ASSET', accounts, entries)
    const fa = buildBSSection('FIXED_ASSET', accounts, entries)
    const cl = buildBSSection('CURRENT_LIABILITY', accounts, entries)
    const ll = buildBSSection('LONG_TERM_LIABILITY', accounts, entries)
    const eq = buildBSSection('EQUITY', accounts, entries)

    const totalAssets = calcTotalAssets(ca, fa)
    const totalL = calcTotalLiabilities(cl, ll)
    const totalLE = calcTotalLiabilitiesAndEquity(totalL, eq.total)

    expect(isBalanced(totalAssets, totalLE)).toBe(true)
    expect(totalAssets).toBe(totalLE)
  })

  it('detects imbalance when assets do not equal liabilities + equity', () => {
    expect(isBalanced(100, 200)).toBe(false)
  })

  it('treats tiny floating-point differences as balanced (< 0.01)', () => {
    expect(isBalanced(100.005, 100)).toBe(true)
  })
})

describe('Balance Sheet — Category Aggregation', () => {
  it('aggregates amounts by category correctly', () => {
    const agg = aggregateByCategory(accounts, entries)
    expect(agg.CURRENT_ASSET).toBe(8_000_000)
    expect(agg.FIXED_ASSET).toBe(20_000_000) // a4 inactive → excluded
    expect(agg.CURRENT_LIABILITY).toBe(4_000_000)
    expect(agg.LONG_TERM_LIABILITY).toBe(12_000_000)
    expect(agg.EQUITY).toBe(12_000_000)
  })
})
