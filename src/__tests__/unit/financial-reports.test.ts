import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BSAccount {
  name: string
  code: string
  balance: number
  type: 'ASSET' | 'LIABILITY' | 'EQUITY'
}

interface PnLAccount {
  name: string
  code: string
  amount: number
  type: 'REVENUE' | 'COGS' | 'OPEX'
}

// ── Balance Sheet logic ────────────────────────────────────────────────────────

function calcBalanceSheetTotals(accounts: BSAccount[]) {
  const assets = accounts.filter(a => a.type === 'ASSET').reduce((s, a) => s + a.balance, 0)
  const liabilities = accounts.filter(a => a.type === 'LIABILITY').reduce((s, a) => s + a.balance, 0)
  const equity = accounts.filter(a => a.type === 'EQUITY').reduce((s, a) => s + a.balance, 0)
  return { assets, liabilities, equity }
}

function isBalanceSheetBalanced(accounts: BSAccount[], tolerance = 0.01): boolean {
  const { assets, liabilities, equity } = calcBalanceSheetTotals(accounts)
  return Math.abs(assets - (liabilities + equity)) < tolerance
}

function validateBalanceSheet(accounts: BSAccount[]): string | null {
  if (accounts.length === 0) return 'Neraca tidak boleh kosong'
  const hasAsset = accounts.some(a => a.type === 'ASSET')
  if (!hasAsset) return 'Neraca harus memiliki minimal satu akun aset'
  if (!isBalanceSheetBalanced(accounts)) return 'Neraca tidak balance: Aset ≠ Kewajiban + Ekuitas'
  return null
}

// ── P&L logic ─────────────────────────────────────────────────────────────────

function calcPnL(accounts: PnLAccount[]) {
  const revenue = accounts.filter(a => a.type === 'REVENUE').reduce((s, a) => s + a.amount, 0)
  const cogs = accounts.filter(a => a.type === 'COGS').reduce((s, a) => s + a.amount, 0)
  const grossProfit = revenue - cogs
  const operatingExpenses = accounts.filter(a => a.type === 'OPEX').reduce((s, a) => s + a.amount, 0)
  const netProfit = grossProfit - operatingExpenses
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0
  return { revenue, cogs, grossProfit, operatingExpenses, netProfit, grossMargin, netMargin }
}

// ── Period comparison logic ────────────────────────────────────────────────────

function calcPctChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/** Format a local date as YYYY-MM-DD without UTC shift */
function localDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Last day of a given month (1-indexed) */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function getPeriodRange(period: 'month' | 'quarter' | 'year', referenceDate: string): { from: string; to: string } {
  const [y, m0] = referenceDate.split('-').map(Number)
  const m = m0 // 1-indexed month

  switch (period) {
    case 'month':
      return {
        from: localDateStr(y, m, 1),
        to: localDateStr(y, m, lastDayOfMonth(y, m)),
      }
    case 'quarter': {
      const q = Math.floor((m - 1) / 3) // 0-indexed quarter
      const qStartMonth = q * 3 + 1     // 1-indexed
      const qEndMonth = qStartMonth + 2
      return {
        from: localDateStr(y, qStartMonth, 1),
        to: localDateStr(y, qEndMonth, lastDayOfMonth(y, qEndMonth)),
      }
    }
    case 'year':
      return {
        from: localDateStr(y, 1, 1),
        to: localDateStr(y, 12, 31),
      }
  }
}

function getPreviousPeriodRange(from: string, to: string): { from: string; to: string } {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const diffMs = toDate.getTime() - fromDate.getTime()
  const prevTo = new Date(fromDate.getTime() - 1)
  const prevFrom = new Date(prevTo.getTime() - diffMs)
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  }
}

// ── Currency formatting ────────────────────────────────────────────────────────

function formatFinancialAmount(amount: number, currency = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount)
}

function formatCompact(amount: number, currency = 'IDR'): string {
  if (Math.abs(amount) >= 1_000_000_000) {
    return `${formatFinancialAmount(amount / 1_000_000_000, currency)} M`
  }
  if (Math.abs(amount) >= 1_000_000) {
    return `${formatFinancialAmount(amount / 1_000_000, currency)} jt`
  }
  return formatFinancialAmount(amount, currency)
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const balancedAccounts: BSAccount[] = [
  { name: 'Kas', code: '111', balance: 5_000_000, type: 'ASSET' },
  { name: 'Piutang', code: '120', balance: 2_000_000, type: 'ASSET' },
  { name: 'Persediaan', code: '130', balance: 3_000_000, type: 'ASSET' },
  { name: 'Utang Usaha', code: '210', balance: 4_000_000, type: 'LIABILITY' },
  { name: 'Modal', code: '310', balance: 6_000_000, type: 'EQUITY' },
]
// Assets = 10_000_000, Liabilities + Equity = 10_000_000 ✓

const pnlAccounts: PnLAccount[] = [
  { name: 'Penjualan', code: '410', amount: 10_000_000, type: 'REVENUE' },
  { name: 'HPP', code: '510', amount: 4_000_000, type: 'COGS' },
  { name: 'Biaya Gaji', code: '520', amount: 1_500_000, type: 'OPEX' },
  { name: 'Biaya Sewa', code: '530', amount: 500_000, type: 'OPEX' },
]

// ── Tests: Balance Sheet Equation ────────────────────────────────────────────

describe('Balance Sheet — equation validation', () => {
  it('balanced accounts pass the check', () => {
    expect(isBalanceSheetBalanced(balancedAccounts)).toBe(true)
  })

  it('unbalanced accounts fail the check', () => {
    const unbalanced: BSAccount[] = [
      { name: 'Kas', code: '111', balance: 10_000_000, type: 'ASSET' },
      { name: 'Utang', code: '210', balance: 3_000_000, type: 'LIABILITY' },
      // equity only 5M, so assets ≠ liabilities + equity
      { name: 'Modal', code: '310', balance: 5_000_000, type: 'EQUITY' },
    ]
    expect(isBalanceSheetBalanced(unbalanced)).toBe(false)
  })

  it('computes asset total correctly', () => {
    const { assets } = calcBalanceSheetTotals(balancedAccounts)
    expect(assets).toBe(10_000_000)
  })

  it('computes liability total correctly', () => {
    const { liabilities } = calcBalanceSheetTotals(balancedAccounts)
    expect(liabilities).toBe(4_000_000)
  })

  it('computes equity total correctly', () => {
    const { equity } = calcBalanceSheetTotals(balancedAccounts)
    expect(equity).toBe(6_000_000)
  })

  it('rejects empty accounts', () => {
    expect(validateBalanceSheet([])).toBe('Neraca tidak boleh kosong')
  })

  it('rejects accounts with no assets', () => {
    const noAssets: BSAccount[] = [
      { name: 'Utang', code: '210', balance: 0, type: 'LIABILITY' },
    ]
    expect(validateBalanceSheet(noAssets)).toBe('Neraca harus memiliki minimal satu akun aset')
  })

  it('validates balanced accounts successfully', () => {
    expect(validateBalanceSheet(balancedAccounts)).toBeNull()
  })

  it('tolerance allows tiny float differences', () => {
    const floaty: BSAccount[] = [
      { name: 'Kas', code: '111', balance: 0.009, type: 'ASSET' },
      { name: 'Modal', code: '310', balance: 0, type: 'EQUITY' },
      { name: 'Utang', code: '210', balance: 0, type: 'LIABILITY' },
    ]
    // 0.009 < 0.01 tolerance — treated as balanced
    expect(isBalanceSheetBalanced(floaty)).toBe(true)
  })
})

// ── Tests: P&L Calculations ──────────────────────────────────────────────────

describe('P&L — gross profit and net profit', () => {
  it('calculates revenue correctly', () => {
    expect(calcPnL(pnlAccounts).revenue).toBe(10_000_000)
  })

  it('calculates COGS correctly', () => {
    expect(calcPnL(pnlAccounts).cogs).toBe(4_000_000)
  })

  it('calculates gross profit as revenue minus COGS', () => {
    expect(calcPnL(pnlAccounts).grossProfit).toBe(6_000_000)
  })

  it('calculates operating expenses correctly', () => {
    expect(calcPnL(pnlAccounts).operatingExpenses).toBe(2_000_000)
  })

  it('calculates net profit as gross profit minus opex', () => {
    expect(calcPnL(pnlAccounts).netProfit).toBe(4_000_000)
  })

  it('calculates gross margin percentage', () => {
    expect(calcPnL(pnlAccounts).grossMargin).toBeCloseTo(60, 1)
  })

  it('calculates net margin percentage', () => {
    expect(calcPnL(pnlAccounts).netMargin).toBeCloseTo(40, 1)
  })

  it('returns zero margins when revenue is zero', () => {
    const empty: PnLAccount[] = []
    const { grossMargin, netMargin } = calcPnL(empty)
    expect(grossMargin).toBe(0)
    expect(netMargin).toBe(0)
  })

  it('handles net loss (expenses exceed revenue)', () => {
    const lossAccounts: PnLAccount[] = [
      { name: 'Penjualan', code: '410', amount: 1_000_000, type: 'REVENUE' },
      { name: 'HPP', code: '510', amount: 800_000, type: 'COGS' },
      { name: 'Sewa', code: '520', amount: 500_000, type: 'OPEX' },
    ]
    const { netProfit } = calcPnL(lossAccounts)
    expect(netProfit).toBe(-300_000)
  })
})

// ── Tests: Period comparison ──────────────────────────────────────────────────

describe('Period comparison logic', () => {
  it('pctChange returns positive for growth', () => {
    expect(calcPctChange(1_200_000, 1_000_000)).toBeCloseTo(20, 1)
  })

  it('pctChange returns negative for decline', () => {
    expect(calcPctChange(800_000, 1_000_000)).toBeCloseTo(-20, 1)
  })

  it('pctChange returns null when previous is zero', () => {
    expect(calcPctChange(500_000, 0)).toBeNull()
  })

  it('pctChange returns 0 for no change', () => {
    expect(calcPctChange(1_000_000, 1_000_000)).toBeCloseTo(0, 1)
  })

  it('getPeriodRange month returns correct first and last day', () => {
    const { from, to } = getPeriodRange('month', '2025-03-15')
    expect(from).toBe('2025-03-01')
    expect(to).toBe('2025-03-31')
  })

  it('getPeriodRange year returns full year', () => {
    const { from, to } = getPeriodRange('year', '2025-06-01')
    expect(from).toBe('2025-01-01')
    expect(to).toBe('2025-12-31')
  })

  it('getPreviousPeriodRange produces non-overlapping range', () => {
    const { from: pf, to: pt } = getPreviousPeriodRange('2025-03-01', '2025-03-31')
    // Previous to must be before current from
    expect(new Date(pt) < new Date('2025-03-01')).toBe(true)
    // Previous from must be before previous to
    expect(new Date(pf) < new Date(pt)).toBe(true)
  })
})

// ── Tests: Currency formatting ────────────────────────────────────────────────

describe('Financial currency formatting', () => {
  it('formats IDR with thousand separators', () => {
    const result = formatFinancialAmount(1_500_000, 'IDR')
    expect(result).toContain('1')
    expect(result).toContain('500')
    expect(result).toContain('000')
  })

  it('formats zero correctly', () => {
    const result = formatFinancialAmount(0, 'IDR')
    expect(result).toContain('0')
  })

  it('formats negative amounts', () => {
    const result = formatFinancialAmount(-500_000, 'IDR')
    expect(result).toContain('500')
  })

  it('formatCompact shows jt suffix for millions', () => {
    const result = formatCompact(5_000_000, 'IDR')
    expect(result).toContain('jt')
  })

  it('formatCompact shows M suffix for billions', () => {
    const result = formatCompact(2_000_000_000, 'IDR')
    expect(result).toContain('M')
  })

  it('formatCompact leaves small amounts unchanged', () => {
    const result = formatCompact(50_000, 'IDR')
    expect(result).not.toContain('jt')
    expect(result).not.toContain('M')
  })
})
