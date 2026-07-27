import { describe, it, expect } from 'vitest'

// ── Accounting business logic ─────────────────────────────────────────────────

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
type AccountNormalBalance = 'DEBIT' | 'CREDIT'
type JournalEntryStatus = 'DRAFT' | 'POSTED' | 'VOIDED'

interface Account {
  id: string
  code: string
  name: string
  type: AccountType
  normalBalance: AccountNormalBalance
  balance: number
  active: boolean
}

interface JournalLine {
  accountId: string
  debit: number
  credit: number
  description?: string
}

interface JournalEntry {
  id: string
  date: string
  description: string
  reference?: string
  status: JournalEntryStatus
  lines: JournalLine[]
}

// ── Pure functions ─────────────────────────────────────────────────────────────

function isJournalBalanced(lines: JournalLine[]): boolean {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
  return Math.abs(totalDebit - totalCredit) < 0.001 // float tolerance
}

function totalDebits(lines: JournalLine[]): number {
  return lines.reduce((s, l) => s + l.debit, 0)
}

function totalCredits(lines: JournalLine[]): number {
  return lines.reduce((s, l) => s + l.credit, 0)
}

function getNormalBalance(type: AccountType): AccountNormalBalance {
  return ['ASSET', 'EXPENSE'].includes(type) ? 'DEBIT' : 'CREDIT'
}

function calcAccountBalance(account: Account, lines: JournalLine[]): number {
  const normalBalance = getNormalBalance(account.type)
  return lines.reduce((balance, line) => {
    if (normalBalance === 'DEBIT') return balance + line.debit - line.credit
    return balance + line.credit - line.debit
  }, account.balance)
}

function validateJournalEntry(entry: Partial<JournalEntry>): string | null {
  if (!entry.date) return 'Tanggal harus diisi'
  if (!entry.description || entry.description.trim().length < 2) return 'Deskripsi minimal 2 karakter'
  if (!entry.lines || entry.lines.length < 2) return 'Minimal 2 baris jurnal'
  for (const line of entry.lines) {
    if (line.debit < 0 || line.credit < 0) return 'Nilai tidak boleh negatif'
    if (line.debit > 0 && line.credit > 0) return 'Baris tidak boleh punya debit dan kredit sekaligus'
    if (line.debit === 0 && line.credit === 0) return 'Baris tidak boleh nol semua'
  }
  if (!isJournalBalanced(entry.lines)) return 'Jurnal tidak balance (debit ≠ kredit)'
  return null
}

function validateAccountCode(code: string): string | null {
  if (!code) return 'Kode akun harus diisi'
  if (!/^\d{3,6}$/.test(code)) return 'Kode akun harus 3-6 digit angka'
  return null
}

// CoA standard account code ranges
function getAccountTypeFromCode(code: string): AccountType | null {
  const n = parseInt(code)
  if (n >= 100 && n < 200) return 'ASSET'
  if (n >= 200 && n < 300) return 'LIABILITY'
  if (n >= 300 && n < 400) return 'EQUITY'
  if (n >= 400 && n < 500) return 'REVENUE'
  if (n >= 500 && n < 700) return 'EXPENSE'
  return null
}

function buildPnL(accounts: Account[], from: string, to: string, entries: JournalEntry[]): {
  revenue: number; expenses: number; netProfit: number
} {
  const postedEntries = entries.filter(e => e.status === 'POSTED' && e.date >= from && e.date <= to)
  const allLines = postedEntries.flatMap(e => e.lines.map(l => ({ ...l, entryId: e.id })))

  let revenue = 0
  let expenses = 0

  for (const account of accounts) {
    const accountLines = allLines.filter(l => l.accountId === account.id)
    const movement = account.type === 'REVENUE'
      ? accountLines.reduce((s, l) => s + l.credit - l.debit, 0)
      : accountLines.reduce((s, l) => s + l.debit - l.credit, 0)

    if (account.type === 'REVENUE') revenue += movement
    if (account.type === 'EXPENSE') expenses += movement
  }

  return { revenue, expenses, netProfit: revenue - expenses }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Journal entry balance check', () => {
  it('balanced entry passes', () => {
    const lines: JournalLine[] = [
      { accountId: 'a1', debit: 100000, credit: 0 },
      { accountId: 'a2', debit: 0, credit: 100000 },
    ]
    expect(isJournalBalanced(lines)).toBe(true)
  })

  it('unbalanced entry fails', () => {
    const lines: JournalLine[] = [
      { accountId: 'a1', debit: 100000, credit: 0 },
      { accountId: 'a2', debit: 0, credit: 90000 },
    ]
    expect(isJournalBalanced(lines)).toBe(false)
  })

  it('multi-line balanced entry', () => {
    const lines: JournalLine[] = [
      { accountId: 'a1', debit: 150000, credit: 0 },
      { accountId: 'a2', debit: 0, credit: 100000 },
      { accountId: 'a3', debit: 0, credit: 50000 },
    ]
    expect(isJournalBalanced(lines)).toBe(true)
  })

  it('handles float rounding tolerance', () => {
    const lines: JournalLine[] = [
      { accountId: 'a1', debit: 33333.33, credit: 0 },
      { accountId: 'a2', debit: 33333.33, credit: 0 },
      { accountId: 'a3', debit: 0, credit: 66666.66 },
    ]
    expect(isJournalBalanced(lines)).toBe(true)
  })

  it('empty lines is considered balanced (trivially)', () => {
    expect(isJournalBalanced([])).toBe(true)
  })
})

describe('Total debits and credits', () => {
  const lines: JournalLine[] = [
    { accountId: 'a1', debit: 500000, credit: 0 },
    { accountId: 'a2', debit: 200000, credit: 0 },
    { accountId: 'a3', debit: 0, credit: 700000 },
  ]
  it('sums debits correctly', () => expect(totalDebits(lines)).toBe(700000))
  it('sums credits correctly', () => expect(totalCredits(lines)).toBe(700000))
})

describe('Normal balance by account type', () => {
  it('ASSET has DEBIT normal balance', () => expect(getNormalBalance('ASSET')).toBe('DEBIT'))
  it('EXPENSE has DEBIT normal balance', () => expect(getNormalBalance('EXPENSE')).toBe('DEBIT'))
  it('LIABILITY has CREDIT normal balance', () => expect(getNormalBalance('LIABILITY')).toBe('CREDIT'))
  it('EQUITY has CREDIT normal balance', () => expect(getNormalBalance('EQUITY')).toBe('CREDIT'))
  it('REVENUE has CREDIT normal balance', () => expect(getNormalBalance('REVENUE')).toBe('CREDIT'))
})

describe('Account balance calculation', () => {
  const cashAccount: Account = {
    id: 'a1', code: '111', name: 'Kas', type: 'ASSET', normalBalance: 'DEBIT', balance: 1000000, active: true
  }
  const salesAccount: Account = {
    id: 'a2', code: '410', name: 'Penjualan', type: 'REVENUE', normalBalance: 'CREDIT', balance: 0, active: true
  }

  it('ASSET increases with debit', () => {
    const lines: JournalLine[] = [{ accountId: 'a1', debit: 500000, credit: 0 }]
    expect(calcAccountBalance(cashAccount, lines)).toBe(1500000)
  })
  it('ASSET decreases with credit', () => {
    const lines: JournalLine[] = [{ accountId: 'a1', debit: 0, credit: 200000 }]
    expect(calcAccountBalance(cashAccount, lines)).toBe(800000)
  })
  it('REVENUE increases with credit', () => {
    const lines: JournalLine[] = [{ accountId: 'a2', debit: 0, credit: 300000 }]
    expect(calcAccountBalance(salesAccount, lines)).toBe(300000)
  })
  it('REVENUE decreases with debit (refund/reversal)', () => {
    const lines: JournalLine[] = [{ accountId: 'a2', debit: 50000, credit: 0 }]
    expect(calcAccountBalance(salesAccount, lines)).toBe(-50000)
  })
  it('returns opening balance when no lines', () => {
    expect(calcAccountBalance(cashAccount, [])).toBe(1000000)
  })
})

describe('Journal entry validation', () => {
  const validEntry: Partial<JournalEntry> = {
    date: '2025-06-01',
    description: 'Penjualan tunai',
    lines: [
      { accountId: 'a1', debit: 100000, credit: 0 },
      { accountId: 'a2', debit: 0, credit: 100000 },
    ]
  }

  it('accepts valid entry', () => expect(validateJournalEntry(validEntry)).toBeNull())
  it('rejects missing date', () => expect(validateJournalEntry({ ...validEntry, date: '' })).toBe('Tanggal harus diisi'))
  it('rejects short description', () => expect(validateJournalEntry({ ...validEntry, description: 'X' })).toBe('Deskripsi minimal 2 karakter'))
  it('rejects single line', () => {
    expect(validateJournalEntry({ ...validEntry, lines: [{ accountId: 'a1', debit: 100000, credit: 0 }] }))
      .toBe('Minimal 2 baris jurnal')
  })
  it('rejects negative values', () => {
    expect(validateJournalEntry({ ...validEntry, lines: [
      { accountId: 'a1', debit: -100, credit: 0 },
      { accountId: 'a2', debit: 0, credit: -100 },
    ]})).toBe('Nilai tidak boleh negatif')
  })
  it('rejects line with both debit and credit', () => {
    expect(validateJournalEntry({ ...validEntry, lines: [
      { accountId: 'a1', debit: 100000, credit: 50000 },
      { accountId: 'a2', debit: 0, credit: 50000 },
    ]})).toBe('Baris tidak boleh punya debit dan kredit sekaligus')
  })
  it('rejects zero line', () => {
    expect(validateJournalEntry({ ...validEntry, lines: [
      { accountId: 'a1', debit: 100000, credit: 0 },
      { accountId: 'a2', debit: 0, credit: 100000 },
      { accountId: 'a3', debit: 0, credit: 0 },
    ]})).toBe('Baris tidak boleh nol semua')
  })
  it('rejects unbalanced entry', () => {
    expect(validateJournalEntry({ ...validEntry, lines: [
      { accountId: 'a1', debit: 100000, credit: 0 },
      { accountId: 'a2', debit: 0, credit: 80000 },
    ]})).toBe('Jurnal tidak balance (debit ≠ kredit)')
  })
})

describe('Account code validation', () => {
  it('accepts 3-digit code', () => expect(validateAccountCode('111')).toBeNull())
  it('accepts 6-digit code', () => expect(validateAccountCode('110100')).toBeNull())
  it('rejects empty code', () => expect(validateAccountCode('')).toBe('Kode akun harus diisi'))
  it('rejects 2-digit code', () => expect(validateAccountCode('11')).toBe('Kode akun harus 3-6 digit angka'))
  it('rejects alpha characters', () => expect(validateAccountCode('1a1')).toBe('Kode akun harus 3-6 digit angka'))
  it('rejects 7-digit code', () => expect(validateAccountCode('1111111')).toBe('Kode akun harus 3-6 digit angka'))
})

describe('Account type from code (CoA ranges)', () => {
  it('100-199 is ASSET', () => expect(getAccountTypeFromCode('110')).toBe('ASSET'))
  it('200-299 is LIABILITY', () => expect(getAccountTypeFromCode('210')).toBe('LIABILITY'))
  it('300-399 is EQUITY', () => expect(getAccountTypeFromCode('310')).toBe('EQUITY'))
  it('400-499 is REVENUE', () => expect(getAccountTypeFromCode('410')).toBe('REVENUE'))
  it('500-699 is EXPENSE', () => expect(getAccountTypeFromCode('510')).toBe('EXPENSE'))
  it('returns null for out-of-range', () => expect(getAccountTypeFromCode('010')).toBeNull())
})

describe('P&L calculation', () => {
  const accounts: Account[] = [
    { id: 'rev', code: '410', name: 'Penjualan', type: 'REVENUE', normalBalance: 'CREDIT', balance: 0, active: true },
    { id: 'cogs', code: '510', name: 'HPP', type: 'EXPENSE', normalBalance: 'DEBIT', balance: 0, active: true },
    { id: 'rent', code: '520', name: 'Sewa', type: 'EXPENSE', normalBalance: 'DEBIT', balance: 0, active: true },
  ]
  const entries: JournalEntry[] = [
    {
      id: 'j1', date: '2025-06-15', description: 'Penjualan', status: 'POSTED',
      lines: [
        { accountId: 'rev', debit: 0, credit: 1000000 },
        { accountId: 'cash', debit: 1000000, credit: 0 },
      ]
    },
    {
      id: 'j2', date: '2025-06-16', description: 'HPP', status: 'POSTED',
      lines: [
        { accountId: 'cogs', debit: 400000, credit: 0 },
        { accountId: 'inv', debit: 0, credit: 400000 },
      ]
    },
    {
      id: 'j3', date: '2025-06-17', description: 'Sewa', status: 'POSTED',
      lines: [
        { accountId: 'rent', debit: 100000, credit: 0 },
        { accountId: 'cash', debit: 0, credit: 100000 },
      ]
    },
    {
      id: 'j4', date: '2025-07-01', description: 'Outside range', status: 'POSTED',
      lines: [
        { accountId: 'rev', debit: 0, credit: 9999999 },
        { accountId: 'cash', debit: 9999999, credit: 0 },
      ]
    },
    {
      id: 'j5', date: '2025-06-20', description: 'Draft not counted', status: 'DRAFT',
      lines: [
        { accountId: 'rev', debit: 0, credit: 9999999 },
        { accountId: 'cash', debit: 9999999, credit: 0 },
      ]
    },
  ]

  it('calculates revenue correctly', () => {
    const { revenue } = buildPnL(accounts, '2025-06-01', '2025-06-30', entries)
    expect(revenue).toBe(1000000)
  })
  it('calculates expenses correctly', () => {
    const { expenses } = buildPnL(accounts, '2025-06-01', '2025-06-30', entries)
    expect(expenses).toBe(500000)
  })
  it('calculates net profit', () => {
    const { netProfit } = buildPnL(accounts, '2025-06-01', '2025-06-30', entries)
    expect(netProfit).toBe(500000)
  })
  it('excludes DRAFT entries', () => {
    const { revenue } = buildPnL(accounts, '2025-06-01', '2025-06-30', entries)
    expect(revenue).toBe(1000000) // not 10999999
  })
  it('excludes entries outside date range', () => {
    const { revenue } = buildPnL(accounts, '2025-06-01', '2025-06-30', entries)
    expect(revenue).toBe(1000000) // July entry excluded
  })
  it('returns zeros for empty period', () => {
    const { revenue, expenses, netProfit } = buildPnL(accounts, '2025-01-01', '2025-01-31', entries)
    expect(revenue).toBe(0)
    expect(expenses).toBe(0)
    expect(netProfit).toBe(0)
  })
})
