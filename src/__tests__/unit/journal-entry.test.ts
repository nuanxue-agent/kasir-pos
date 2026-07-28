import { describe, it, expect } from 'vitest'

// -- Types -------------------------------------------------------------------

interface JournalLine {
  id: string
  entryId: string
  accountCode: string
  accountName: string
  debit: number
  credit: number
  memo: string | null
}

interface TrialRow {
  accountCode: string
  accountName: string
  totalDebit: number
  totalCredit: number
  balance: number
}

// -- Pure helpers ------------------------------------------------------------

function validateBalance(lines: Array<{ debit: number; credit: number }>): boolean {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
  return Math.abs(totalDebit - totalCredit) < 0.01
}

function getTotals(lines: Array<{ debit: number; credit: number }>) {
  return {
    totalDebit: lines.reduce((s, l) => s + l.debit, 0),
    totalCredit: lines.reduce((s, l) => s + l.credit, 0),
  }
}

function generateEntryNumber(lastNumber: string | null, year: number): string {
  if (!lastNumber) return `JE-${year}-0001`
  const parts = lastNumber.split('-')
  const seq = parseInt(parts[parts.length - 1] ?? '0', 10) + 1
  return `JE-${year}-${String(seq).padStart(4, '0')}`
}

function buildTrialBalance(lines: JournalLine[], postedEntryIds: Set<string>): TrialRow[] {
  const byAccount: Record<string, TrialRow> = {}
  for (const line of lines) {
    if (!postedEntryIds.has(line.entryId)) continue
    if (!byAccount[line.accountCode]) {
      byAccount[line.accountCode] = {
        accountCode: line.accountCode,
        accountName: line.accountName,
        totalDebit: 0,
        totalCredit: 0,
        balance: 0,
      }
    }
    byAccount[line.accountCode].totalDebit += line.debit
    byAccount[line.accountCode].totalCredit += line.credit
    byAccount[line.accountCode].balance += line.debit - line.credit
  }
  return Object.values(byAccount)
}

function isTBBalanced(rows: TrialRow[]): boolean {
  const totalDebit = rows.reduce((s, r) => s + r.totalDebit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.totalCredit, 0)
  return Math.abs(totalDebit - totalCredit) < 0.01
}

function computeRunningBalance(lines: JournalLine[]): Array<JournalLine & { runningBalance: number }> {
  let bal = 0
  return lines.map(l => {
    bal += l.debit - l.credit
    return { ...l, runningBalance: bal }
  })
}

function buildReversalLines(original: JournalLine[]): Array<Omit<JournalLine, 'id' | 'entryId'>> {
  return original.map(l => ({
    accountCode: l.accountCode,
    accountName: l.accountName,
    debit: l.credit,
    credit: l.debit,
    memo: l.memo,
    storeId: '',
  }))
}

// -- Fixtures ----------------------------------------------------------------

const ENTRY_ID = 'entry-1'
const ENTRY_ID2 = 'entry-2'

const balancedLines: JournalLine[] = [
  { id: 'l1', entryId: ENTRY_ID, accountCode: '1101', accountName: 'Kas', debit: 1_000_000, credit: 0, memo: null },
  { id: 'l2', entryId: ENTRY_ID, accountCode: '4101', accountName: 'Pendapatan', debit: 0, credit: 1_000_000, memo: null },
]

const unbalancedLines: JournalLine[] = [
  { id: 'l3', entryId: ENTRY_ID, accountCode: '1101', accountName: 'Kas', debit: 500_000, credit: 0, memo: null },
  { id: 'l4', entryId: ENTRY_ID, accountCode: '4101', accountName: 'Pendapatan', debit: 0, credit: 300_000, memo: null },
]

const multiEntryLines: JournalLine[] = [
  { id: 'l5', entryId: ENTRY_ID,  accountCode: '1101', accountName: 'Kas',        debit: 2_000_000, credit: 0,         memo: null },
  { id: 'l6', entryId: ENTRY_ID,  accountCode: '4101', accountName: 'Pendapatan', debit: 0,         credit: 2_000_000, memo: null },
  { id: 'l7', entryId: ENTRY_ID2, accountCode: '5101', accountName: 'Beban Sewa', debit: 500_000,   credit: 0,         memo: null },
  { id: 'l8', entryId: ENTRY_ID2, accountCode: '1101', accountName: 'Kas',        debit: 0,         credit: 500_000,   memo: null },
]

// -- Tests -------------------------------------------------------------------

describe('Journal Entry -- Debit/Credit Balance Validation', () => {
  it('returns true when debits equal credits', () => {
    expect(validateBalance(balancedLines)).toBe(true)
  })

  it('returns false when debits do not equal credits', () => {
    expect(validateBalance(unbalancedLines)).toBe(false)
  })

  it('handles floating-point differences within 0.01 tolerance', () => {
    const lines = [{ debit: 1000.005, credit: 0 }, { debit: 0, credit: 1000 }]
    expect(validateBalance(lines)).toBe(true)
  })

  it('getTotals returns correct debit and credit sums', () => {
    const { totalDebit, totalCredit } = getTotals(balancedLines)
    expect(totalDebit).toBe(1_000_000)
    expect(totalCredit).toBe(1_000_000)
  })
})

describe('Journal Entry -- Entry Number Generation', () => {
  it('generates first entry number when no prior entries exist', () => {
    expect(generateEntryNumber(null, 2024)).toBe('JE-2024-0001')
  })

  it('increments sequence from last entry number', () => {
    expect(generateEntryNumber('JE-2024-0005', 2024)).toBe('JE-2024-0006')
  })

  it('pads sequence to 4 digits', () => {
    expect(generateEntryNumber('JE-2024-0009', 2024)).toBe('JE-2024-0010')
  })
})

describe('Journal Entry -- Trial Balance Calculation', () => {
  it('only includes posted entries in trial balance', () => {
    const posted = new Set([ENTRY_ID])
    const rows = buildTrialBalance(multiEntryLines, posted)
    const codes = rows.map(r => r.accountCode)
    expect(codes).toContain('1101')
    expect(codes).toContain('4101')
    expect(codes).not.toContain('5101')
  })

  it('aggregates debit and credit per account correctly', () => {
    const posted = new Set([ENTRY_ID, ENTRY_ID2])
    const rows = buildTrialBalance(multiEntryLines, posted)
    const kas = rows.find(r => r.accountCode === '1101')!
    expect(kas.totalDebit).toBe(2_000_000)
    expect(kas.totalCredit).toBe(500_000)
    expect(kas.balance).toBe(1_500_000)
  })

  it('trial balance is balanced when all entries are balanced', () => {
    const posted = new Set([ENTRY_ID, ENTRY_ID2])
    const rows = buildTrialBalance(multiEntryLines, posted)
    expect(isTBBalanced(rows)).toBe(true)
  })
})

describe('Journal Entry -- Running Balance Calculation', () => {
  it('computes running balance as cumulative debit minus credit', () => {
    const lines: JournalLine[] = [
      { id: 'r1', entryId: 'e1', accountCode: '1101', accountName: 'Kas', debit: 1_000_000, credit: 0, memo: null },
      { id: 'r2', entryId: 'e2', accountCode: '1101', accountName: 'Kas', debit: 0, credit: 300_000, memo: null },
      { id: 'r3', entryId: 'e3', accountCode: '1101', accountName: 'Kas', debit: 200_000, credit: 0, memo: null },
    ]
    const result = computeRunningBalance(lines)
    expect(result[0].runningBalance).toBe(1_000_000)
    expect(result[1].runningBalance).toBe(700_000)
    expect(result[2].runningBalance).toBe(900_000)
  })

  it('running balance goes negative when credits exceed debits', () => {
    const lines: JournalLine[] = [
      { id: 'x1', entryId: 'e1', accountCode: '2101', accountName: 'Utang', debit: 0, credit: 500_000, memo: null },
      { id: 'x2', entryId: 'e2', accountCode: '2101', accountName: 'Utang', debit: 200_000, credit: 0, memo: null },
    ]
    const result = computeRunningBalance(lines)
    expect(result[0].runningBalance).toBe(-500_000)
    expect(result[1].runningBalance).toBe(-300_000)
  })
})

describe('Journal Entry -- Reversal Entry Generation', () => {
  it('swaps debit and credit in reversal lines', () => {
    const reversed = buildReversalLines(balancedLines)
    expect(reversed[0].debit).toBe(0)
    expect(reversed[0].credit).toBe(1_000_000)
    expect(reversed[1].debit).toBe(1_000_000)
    expect(reversed[1].credit).toBe(0)
  })

  it('reversal lines are balanced', () => {
    const reversed = buildReversalLines(balancedLines)
    expect(validateBalance(reversed)).toBe(true)
  })
})
