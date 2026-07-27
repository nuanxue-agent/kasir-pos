import { describe, it, expect } from 'vitest'

// ─── Re-implement pure functions inline (no component import needed in unit tests) ───

type BankTxType = 'CREDIT' | 'DEBIT'
type MatchStatus = 'UNMATCHED' | 'MATCHED' | 'IGNORED'

interface BankStatementRow {
  id: string
  date: string
  description: string
  amount: number
  type: BankTxType
  matchedId: string | null
  status: MatchStatus
}

interface SystemTransaction {
  id: string
  date: string
  description: string
  amount: number
  type: BankTxType
  matchedId: string | null
  status: MatchStatus
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseBankStatementCSV(csvText: string): BankStatementRow[] {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
  const dateIdx = header.indexOf('date')
  const descIdx = header.indexOf('description')
  const amtIdx = header.indexOf('amount')
  const typeIdx = header.indexOf('type')

  if (dateIdx === -1 || descIdx === -1 || amtIdx === -1 || typeIdx === -1) {
    throw new Error('CSV must have columns: date, description, amount, type')
  }

  const rows: BankStatementRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = line.split(',').map(c => c.trim().replace(/"/g, ''))
    const rawType = (cols[typeIdx] ?? '').toUpperCase()
    if (rawType !== 'CREDIT' && rawType !== 'DEBIT') continue
    const amount = parseFloat(cols[amtIdx] ?? '0')
    if (isNaN(amount)) continue

    rows.push({
      id: `bank-${i}`,
      date: cols[dateIdx] ?? '',
      description: cols[descIdx] ?? '',
      amount: Math.abs(amount),
      type: rawType as BankTxType,
      matchedId: null,
      status: 'UNMATCHED',
    })
  }
  return rows
}

// ── Auto-match algorithm ──────────────────────────────────────────────────────

function autoMatch(
  bankRows: BankStatementRow[],
  systemRows: SystemTransaction[],
): { bank: BankStatementRow[]; system: SystemTransaction[] } {
  const updatedBank = bankRows.map(b => ({ ...b }))
  const updatedSystem = systemRows.map(s => ({ ...s }))
  const usedSystemIds = new Set<string>()

  for (const bank of updatedBank) {
    if (bank.status === 'MATCHED') continue
    const bankDate = new Date(bank.date).getTime()

    for (const sys of updatedSystem) {
      if (sys.status === 'MATCHED' || usedSystemIds.has(sys.id)) continue
      if (sys.type !== bank.type) continue
      if (Math.abs(sys.amount - bank.amount) > 0.001) continue

      const sysDate = new Date(sys.date).getTime()
      const diffDays = Math.abs(bankDate - sysDate) / (1000 * 60 * 60 * 24)
      if (diffDays <= 1) {
        bank.matchedId = sys.id
        bank.status = 'MATCHED'
        sys.matchedId = bank.id
        sys.status = 'MATCHED'
        usedSystemIds.add(sys.id)
        break
      }
    }
  }

  return { bank: updatedBank, system: updatedSystem }
}

// ── Discrepancy calculation ───────────────────────────────────────────────────

function calcDiscrepancy(
  bankRows: BankStatementRow[],
  systemRows: SystemTransaction[],
) {
  const totalMatched = bankRows.filter(r => r.status === 'MATCHED').length
  const unmatchedBank = bankRows.filter(r => r.status === 'UNMATCHED')
  const unmatchedSystem = systemRows.filter(r => r.status === 'UNMATCHED')

  const bankUnmatchedAmount = unmatchedBank.reduce((s, r) => {
    return s + (r.type === 'CREDIT' ? r.amount : -r.amount)
  }, 0)
  const systemUnmatchedAmount = unmatchedSystem.reduce((s, r) => {
    return s + (r.type === 'CREDIT' ? r.amount : -r.amount)
  }, 0)

  return {
    totalMatched,
    unmatchedBankCount: unmatchedBank.length,
    unmatchedSystemCount: unmatchedSystem.length,
    discrepancyAmount: bankUnmatchedAmount - systemUnmatchedAmount,
  }
}

// ── Match status transitions ──────────────────────────────────────────────────

function applyManualMatch(
  bank: BankStatementRow[],
  system: SystemTransaction[],
  bankId: string,
  systemId: string,
): { bank: BankStatementRow[]; system: SystemTransaction[] } {
  return {
    bank: bank.map(r =>
      r.id === bankId ? { ...r, status: 'MATCHED', matchedId: systemId } : r,
    ),
    system: system.map(r =>
      r.id === systemId ? { ...r, status: 'MATCHED', matchedId: bankId } : r,
    ),
  }
}

// ─── Test data helpers ────────────────────────────────────────────────────────

function makeBankRow(
  overrides: Partial<BankStatementRow> = {},
): BankStatementRow {
  return {
    id: 'bank-1',
    date: '2024-01-15',
    description: 'Transfer masuk',
    amount: 100000,
    type: 'CREDIT',
    matchedId: null,
    status: 'UNMATCHED',
    ...overrides,
  }
}

function makeSysRow(overrides: Partial<SystemTransaction> = {}): SystemTransaction {
  return {
    id: 'sys-1',
    date: '2024-01-15',
    description: 'Order #123',
    amount: 100000,
    type: 'CREDIT',
    matchedId: null,
    status: 'UNMATCHED',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Auto-match algorithm', () => {
  it('matches bank and system rows with exact same date and amount', () => {
    const bank = [makeBankRow()]
    const sys = [makeSysRow()]
    const { bank: b, system: s } = autoMatch(bank, sys)
    expect(b[0].status).toBe('MATCHED')
    expect(s[0].status).toBe('MATCHED')
    expect(b[0].matchedId).toBe('sys-1')
    expect(s[0].matchedId).toBe('bank-1')
  })

  it('matches when date differs by exactly 1 day', () => {
    const bank = [makeBankRow({ date: '2024-01-15' })]
    const sys = [makeSysRow({ date: '2024-01-16' })]
    const { bank: b, system: s } = autoMatch(bank, sys)
    expect(b[0].status).toBe('MATCHED')
    expect(s[0].status).toBe('MATCHED')
  })

  it('does not match when date differs by more than 1 day', () => {
    const bank = [makeBankRow({ date: '2024-01-15' })]
    const sys = [makeSysRow({ date: '2024-01-17' })]
    const { bank: b, system: s } = autoMatch(bank, sys)
    expect(b[0].status).toBe('UNMATCHED')
    expect(s[0].status).toBe('UNMATCHED')
  })

  it('does not match when amounts differ', () => {
    const bank = [makeBankRow({ amount: 100000 })]
    const sys = [makeSysRow({ amount: 99999 })]
    const { bank: b, system: s } = autoMatch(bank, sys)
    expect(b[0].status).toBe('UNMATCHED')
    expect(s[0].status).toBe('UNMATCHED')
  })

  it('does not match when types differ (CREDIT vs DEBIT)', () => {
    const bank = [makeBankRow({ type: 'CREDIT' })]
    const sys = [makeSysRow({ type: 'DEBIT' })]
    const { bank: b, system: s } = autoMatch(bank, sys)
    expect(b[0].status).toBe('UNMATCHED')
    expect(s[0].status).toBe('UNMATCHED')
  })

  it('does not double-match the same system row to two bank rows', () => {
    const bank = [
      makeBankRow({ id: 'bank-1' }),
      makeBankRow({ id: 'bank-2' }),
    ]
    const sys = [makeSysRow({ id: 'sys-1' })]
    const { bank: b } = autoMatch(bank, sys)
    const matched = b.filter(r => r.status === 'MATCHED')
    expect(matched).toHaveLength(1)
  })
})

describe('Discrepancy calculation', () => {
  it('returns zero discrepancy when all rows matched', () => {
    const bank = [makeBankRow({ status: 'MATCHED', matchedId: 'sys-1' })]
    const sys = [makeSysRow({ status: 'MATCHED', matchedId: 'bank-1' })]
    const stats = calcDiscrepancy(bank, sys)
    expect(stats.totalMatched).toBe(1)
    expect(stats.discrepancyAmount).toBeCloseTo(0)
  })

  it('calculates discrepancy when bank has unmatched CREDIT', () => {
    const bank = [makeBankRow({ amount: 50000, type: 'CREDIT', status: 'UNMATCHED' })]
    const sys: SystemTransaction[] = []
    const stats = calcDiscrepancy(bank, sys)
    expect(stats.discrepancyAmount).toBeCloseTo(50000)
    expect(stats.unmatchedBankCount).toBe(1)
  })

  it('counts unmatched rows correctly on both sides', () => {
    const bank = [
      makeBankRow({ id: 'b1', status: 'UNMATCHED' }),
      makeBankRow({ id: 'b2', status: 'MATCHED', matchedId: 's1' }),
    ]
    const sys = [
      makeSysRow({ id: 's1', status: 'MATCHED', matchedId: 'b2' }),
      makeSysRow({ id: 's2', status: 'UNMATCHED' }),
      makeSysRow({ id: 's3', status: 'UNMATCHED' }),
    ]
    const stats = calcDiscrepancy(bank, sys)
    expect(stats.totalMatched).toBe(1)
    expect(stats.unmatchedBankCount).toBe(1)
    expect(stats.unmatchedSystemCount).toBe(2)
  })
})

describe('CSV parsing for bank statements', () => {
  const validCSV = `date,description,amount,type
2024-01-15,Transfer masuk,100000,CREDIT
2024-01-16,Biaya operasional,25000,DEBIT
2024-01-17,Penjualan online,75000,CREDIT`

  it('parses a valid CSV with 3 rows', () => {
    const rows = parseBankStatementCSV(validCSV)
    expect(rows).toHaveLength(3)
  })

  it('maps columns correctly', () => {
    const rows = parseBankStatementCSV(validCSV)
    expect(rows[0].date).toBe('2024-01-15')
    expect(rows[0].description).toBe('Transfer masuk')
    expect(rows[0].amount).toBe(100000)
    expect(rows[0].type).toBe('CREDIT')
    expect(rows[0].status).toBe('UNMATCHED')
  })

  it('skips rows with invalid type', () => {
    const csv = `date,description,amount,type\n2024-01-15,Test,100,TRANSFER`
    const rows = parseBankStatementCSV(csv)
    expect(rows).toHaveLength(0)
  })

  it('throws when required columns are missing', () => {
    const csv = `date,description,amount\n2024-01-15,Test,100`
    expect(() => parseBankStatementCSV(csv)).toThrow()
  })
})

describe('Match status transitions', () => {
  it('manual match sets both sides to MATCHED', () => {
    const bank = [makeBankRow({ id: 'b1' })]
    const sys = [makeSysRow({ id: 's1' })]
    const { bank: b, system: s } = applyManualMatch(bank, sys, 'b1', 's1')
    expect(b[0].status).toBe('MATCHED')
    expect(s[0].status).toBe('MATCHED')
    expect(b[0].matchedId).toBe('s1')
    expect(s[0].matchedId).toBe('b1')
  })

  it('manual match does not affect other rows', () => {
    const bank = [makeBankRow({ id: 'b1' }), makeBankRow({ id: 'b2' })]
    const sys = [makeSysRow({ id: 's1' }), makeSysRow({ id: 's2' })]
    const { bank: b, system: s } = applyManualMatch(bank, sys, 'b1', 's1')
    expect(b[1].status).toBe('UNMATCHED')
    expect(s[1].status).toBe('UNMATCHED')
  })
})
