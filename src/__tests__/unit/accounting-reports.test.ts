import { describe, it, expect } from 'vitest'

// ─── Pure helper functions (no DB) ────────────────────────────────────────────

/** Calculate gross profit from revenue and COGS */
function calcGrossProfit(revenue: number, cogs: number): number {
  return revenue - cogs
}

/** Calculate gross margin percentage */
function calcGrossMargin(revenue: number, cogs: number): number {
  if (revenue <= 0) return 0
  return ((revenue - cogs) / revenue) * 100
}

/** Calculate COGS from order items */
interface OrderItem {
  qty: number
  cost: number // product.cost
}
function calcCOGS(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.cost, 0)
}

/** Filter items by date range (ISO strings) */
interface Dated {
  date: string
  [key: string]: any
}
function filterByDateRange<T extends Dated>(items: T[], from: string, to: string): T[] {
  const f = new Date(from).getTime()
  const t = new Date(to).getTime()
  return items.filter(item => {
    const d = new Date(item.date).getTime()
    return d >= f && d <= t
  })
}

/** Check if journal entry is balanced (debits === credits within epsilon) */
interface JournalLine {
  accountId: string
  debit: number
  credit: number
}
function isJournalBalanced(lines: JournalLine[], epsilon = 0.01): boolean {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
  return Math.abs(totalDebit - totalCredit) <= epsilon
}

/** Sum account balances by type */
interface CoaAccount {
  id: string
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
  balance: number
  active: boolean
}
function totalBalanceByType(accounts: CoaAccount[], type: CoaAccount['type']): number {
  return accounts.filter(a => a.active && a.type === type).reduce((s, a) => s + a.balance, 0)
}

/** Accounting equation: Assets = Liabilities + Equity */
function checkAccountingEquation(accounts: CoaAccount[]): boolean {
  const assets = totalBalanceByType(accounts, 'ASSET')
  const liabilities = totalBalanceByType(accounts, 'LIABILITY')
  const equity = totalBalanceByType(accounts, 'EQUITY')
  return Math.abs(assets - (liabilities + equity)) < 0.01
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Gross Profit Calculation', () => {
  it('calculates gross profit correctly', () => {
    expect(calcGrossProfit(1_000_000, 600_000)).toBe(400_000)
  })

  it('returns negative gross profit when COGS exceeds revenue', () => {
    expect(calcGrossProfit(500_000, 700_000)).toBe(-200_000)
  })

  it('returns zero gross profit when revenue equals COGS', () => {
    expect(calcGrossProfit(300_000, 300_000)).toBe(0)
  })
})

describe('Gross Margin %', () => {
  it('calculates gross margin correctly', () => {
    expect(calcGrossMargin(1_000_000, 600_000)).toBeCloseTo(40, 5)
  })

  it('returns 0 when revenue is 0 (no division by zero)', () => {
    expect(calcGrossMargin(0, 0)).toBe(0)
  })

  it('returns 100% margin when COGS is 0', () => {
    expect(calcGrossMargin(500_000, 0)).toBeCloseTo(100, 5)
  })

  it('calculates COGS from order items correctly', () => {
    const items: OrderItem[] = [
      { qty: 3, cost: 10_000 },
      { qty: 5, cost: 20_000 },
      { qty: 1, cost: 50_000 },
    ]
    expect(calcCOGS(items)).toBe(3 * 10_000 + 5 * 20_000 + 1 * 50_000)
  })
})

describe('Date Range Filtering', () => {
  const records: Dated[] = [
    { date: '2025-01-01', value: 'jan-1' },
    { date: '2025-03-15', value: 'mar-15' },
    { date: '2025-06-30', value: 'jun-30' },
    { date: '2025-12-31', value: 'dec-31' },
  ]

  it('filters records within a date range', () => {
    const result = filterByDateRange(records, '2025-03-01', '2025-07-01')
    expect(result).toHaveLength(2)
    expect(result.map(r => r.value)).toEqual(['mar-15', 'jun-30'])
  })

  it('includes boundary dates', () => {
    const result = filterByDateRange(records, '2025-01-01', '2025-01-01')
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('jan-1')
  })

  it('returns empty array when no records match', () => {
    const result = filterByDateRange(records, '2024-01-01', '2024-12-31')
    expect(result).toHaveLength(0)
  })
})

describe('Journal Entry Balance Check', () => {
  it('accepts a balanced 2-line journal entry', () => {
    const lines: JournalLine[] = [
      { accountId: 'acc-1', debit: 100_000, credit: 0 },
      { accountId: 'acc-2', debit: 0, credit: 100_000 },
    ]
    expect(isJournalBalanced(lines)).toBe(true)
  })

  it('rejects an unbalanced journal entry', () => {
    const lines: JournalLine[] = [
      { accountId: 'acc-1', debit: 100_000, credit: 0 },
      { accountId: 'acc-2', debit: 0, credit: 90_000 },
    ]
    expect(isJournalBalanced(lines)).toBe(false)
  })

  it('accepts a multi-line balanced entry', () => {
    const lines: JournalLine[] = [
      { accountId: 'acc-cash', debit: 500_000, credit: 0 },
      { accountId: 'acc-rev', debit: 0, credit: 400_000 },
      { accountId: 'acc-tax', debit: 0, credit: 100_000 },
    ]
    expect(isJournalBalanced(lines)).toBe(true)
  })
})

describe('Chart of Accounts Balance', () => {
  const accounts: CoaAccount[] = [
    { id: '1', type: 'ASSET', balance: 500_000, active: true },
    { id: '2', type: 'ASSET', balance: 300_000, active: true },
    { id: '3', type: 'LIABILITY', balance: 200_000, active: true },
    { id: '4', type: 'EQUITY', balance: 600_000, active: true },
    { id: '5', type: 'EXPENSE', balance: 50_000, active: false }, // inactive — excluded
  ]

  it('sums balances by account type correctly', () => {
    expect(totalBalanceByType(accounts, 'ASSET')).toBe(800_000)
    expect(totalBalanceByType(accounts, 'LIABILITY')).toBe(200_000)
    expect(totalBalanceByType(accounts, 'EQUITY')).toBe(600_000)
  })

  it('satisfies the accounting equation (Assets = Liabilities + Equity)', () => {
    expect(checkAccountingEquation(accounts)).toBe(true)
  })

  it('excludes inactive accounts from balance totals', () => {
    expect(totalBalanceByType(accounts, 'EXPENSE')).toBe(0)
  })
})
