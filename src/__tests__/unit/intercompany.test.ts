import { describe, it, expect } from 'vitest'

// ── Types ──────────────────────────────────────────────────────────────────────

type TxType = 'SALE' | 'LOAN' | 'EXPENSE_SHARE' | 'DIVIDEND'
type TxStatus = 'PENDING' | 'CONFIRMED' | 'SETTLED'

interface IntercompanyTransaction {
  id: string
  fromStoreId: string
  toStoreId: string
  type: TxType
  amount: number
  description: string | null
  status: TxStatus
  transactionDate: string
  settledAt: string | null
}

interface EliminationEntry {
  fromStoreId: string
  toStoreId: string
  type: string
  grossAmount: number
  eliminatedAmount: number
  netAmount: number
}

// ── Pure business-logic functions (mirrors API/component logic) ────────────────

const VALID_TYPES: TxType[] = ['SALE', 'LOAN', 'EXPENSE_SHARE', 'DIVIDEND']
const VALID_STATUSES: TxStatus[] = ['PENDING', 'CONFIRMED', 'SETTLED']

function isValidType(type: string): type is TxType {
  return VALID_TYPES.includes(type as TxType)
}

function isValidStatus(status: string): status is TxStatus {
  return VALID_STATUSES.includes(status as TxStatus)
}

function validateTransaction(tx: Partial<IntercompanyTransaction>): string | null {
  if (!tx.fromStoreId || !tx.toStoreId) return 'fromStoreId and toStoreId required'
  if (tx.fromStoreId === tx.toStoreId) return 'fromStoreId and toStoreId must differ'
  if (!tx.type || !isValidType(tx.type)) return 'Invalid type'
  if (typeof tx.amount !== 'number' || tx.amount <= 0) return 'amount must be a positive number'
  if (!tx.transactionDate) return 'transactionDate required'
  return null
}

function buildEliminationEntry(tx: IntercompanyTransaction): EliminationEntry {
  return {
    fromStoreId: tx.fromStoreId,
    toStoreId: tx.toStoreId,
    type: tx.type,
    grossAmount: tx.amount,
    eliminatedAmount: tx.amount,
    netAmount: 0,
  }
}

function calcEliminationTotal(entries: EliminationEntry[]): number {
  return entries.reduce((sum, e) => sum + e.eliminatedAmount, 0)
}

function calcConsolidatedRevenue(transactions: IntercompanyTransaction[]): {
  totalRevenue: number
  totalEliminations: number
  consolidatedRevenue: number
} {
  const confirmedOrSettled = transactions.filter(
    t => t.status === 'CONFIRMED' || t.status === 'SETTLED',
  )
  const totalRevenue = confirmedOrSettled.reduce((s, t) => s + t.amount, 0)
  const entries = confirmedOrSettled.map(buildEliminationEntry)
  const totalEliminations = calcEliminationTotal(entries)
  return { totalRevenue, totalEliminations, consolidatedRevenue: totalRevenue - totalEliminations }
}

function calcNetPositionByStore(
  transactions: IntercompanyTransaction[],
  storeIds: string[],
): Record<string, number> {
  const position: Record<string, number> = {}
  for (const id of storeIds) position[id] = 0
  for (const tx of transactions) {
    if (tx.status !== 'CONFIRMED' && tx.status !== 'SETTLED') continue
    position[tx.fromStoreId] = (position[tx.fromStoreId] ?? 0) - tx.amount
    position[tx.toStoreId]   = (position[tx.toStoreId]   ?? 0) + tx.amount
  }
  return position
}

function canConfirm(tx: IntercompanyTransaction): boolean {
  return tx.status === 'PENDING'
}

function canSettle(tx: IntercompanyTransaction): boolean {
  return tx.status === 'CONFIRMED'
}

function applyAction(tx: IntercompanyTransaction, action: 'confirm' | 'settle'): TxStatus | string {
  if (action === 'confirm') {
    if (!canConfirm(tx)) return 'Only PENDING transactions can be confirmed'
    return 'CONFIRMED'
  }
  if (!canSettle(tx)) return 'Only CONFIRMED transactions can be settled'
  return 'SETTLED'
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Transaction type validation', () => {
  it('accepts all valid types', () => {
    for (const t of VALID_TYPES) expect(isValidType(t)).toBe(true)
  })

  it('rejects an unknown type', () => {
    expect(isValidType('TRANSFER')).toBe(false)
    expect(isValidType('')).toBe(false)
  })

  it('validates a complete valid transaction', () => {
    const tx: Partial<IntercompanyTransaction> = {
      fromStoreId: 'store-a', toStoreId: 'store-b',
      type: 'SALE', amount: 1_000_000, transactionDate: '2025-07-01',
    }
    expect(validateTransaction(tx)).toBeNull()
  })

  it('rejects same fromStoreId and toStoreId', () => {
    const tx: Partial<IntercompanyTransaction> = {
      fromStoreId: 'store-a', toStoreId: 'store-a',
      type: 'LOAN', amount: 500_000, transactionDate: '2025-07-01',
    }
    expect(validateTransaction(tx)).toBe('fromStoreId and toStoreId must differ')
  })

  it('rejects zero or negative amount', () => {
    const tx: Partial<IntercompanyTransaction> = {
      fromStoreId: 'store-a', toStoreId: 'store-b',
      type: 'DIVIDEND', amount: -100, transactionDate: '2025-07-01',
    }
    expect(validateTransaction(tx)).toBe('amount must be a positive number')
  })
})

describe('Elimination entry calculation', () => {
  it('builds an elimination entry with netAmount = 0', () => {
    const tx: IntercompanyTransaction = {
      id: 'tx1', fromStoreId: 'A', toStoreId: 'B', type: 'SALE',
      amount: 2_000_000, description: null, status: 'SETTLED',
      transactionDate: '2025-06-01', settledAt: '2025-06-10',
    }
    const entry = buildEliminationEntry(tx)
    expect(entry.grossAmount).toBe(2_000_000)
    expect(entry.eliminatedAmount).toBe(2_000_000)
    expect(entry.netAmount).toBe(0)
  })

  it('calculates total eliminations across multiple entries', () => {
    const entries: EliminationEntry[] = [
      { fromStoreId: 'A', toStoreId: 'B', type: 'SALE',  grossAmount: 1_000_000, eliminatedAmount: 1_000_000, netAmount: 0 },
      { fromStoreId: 'A', toStoreId: 'C', type: 'LOAN',  grossAmount: 500_000,   eliminatedAmount: 500_000,   netAmount: 0 },
    ]
    expect(calcEliminationTotal(entries)).toBe(1_500_000)
  })
})

describe('Consolidation balance check', () => {
  it('consolidated revenue equals zero when all transactions are eliminated', () => {
    const txs: IntercompanyTransaction[] = [
      { id: 't1', fromStoreId: 'A', toStoreId: 'B', type: 'SALE', amount: 3_000_000, description: null, status: 'SETTLED', transactionDate: '2025-07-01', settledAt: '2025-07-05' },
      { id: 't2', fromStoreId: 'B', toStoreId: 'C', type: 'EXPENSE_SHARE', amount: 1_000_000, description: null, status: 'CONFIRMED', transactionDate: '2025-07-02', settledAt: null },
    ]
    const result = calcConsolidatedRevenue(txs)
    expect(result.consolidatedRevenue).toBe(0)
    expect(result.totalEliminations).toBe(result.totalRevenue)
  })

  it('excludes PENDING transactions from consolidation', () => {
    const txs: IntercompanyTransaction[] = [
      { id: 't1', fromStoreId: 'A', toStoreId: 'B', type: 'LOAN', amount: 5_000_000, description: null, status: 'PENDING', transactionDate: '2025-07-01', settledAt: null },
    ]
    const result = calcConsolidatedRevenue(txs)
    expect(result.totalRevenue).toBe(0)
    expect(result.totalEliminations).toBe(0)
    expect(result.consolidatedRevenue).toBe(0)
  })
})

describe('Net intercompany position', () => {
  it('computes net position: payer is negative, receiver is positive', () => {
    const txs: IntercompanyTransaction[] = [
      { id: 't1', fromStoreId: 'A', toStoreId: 'B', type: 'SALE', amount: 2_000_000, description: null, status: 'SETTLED', transactionDate: '2025-07-01', settledAt: '2025-07-05' },
    ]
    const pos = calcNetPositionByStore(txs, ['A', 'B'])
    expect(pos['A']).toBe(-2_000_000)
    expect(pos['B']).toBe(2_000_000)
  })

  it('net positions across all stores sum to zero', () => {
    const txs: IntercompanyTransaction[] = [
      { id: 't1', fromStoreId: 'A', toStoreId: 'B', type: 'DIVIDEND', amount: 1_000_000, description: null, status: 'CONFIRMED', transactionDate: '2025-07-01', settledAt: null },
      { id: 't2', fromStoreId: 'B', toStoreId: 'C', type: 'LOAN',     amount: 500_000,   description: null, status: 'SETTLED',   transactionDate: '2025-07-02', settledAt: '2025-07-03' },
    ]
    const pos = calcNetPositionByStore(txs, ['A', 'B', 'C'])
    const total = Object.values(pos).reduce((s, v) => s + v, 0)
    expect(total).toBe(0)
  })
})

describe('Settlement status transitions', () => {
  it('allows confirming a PENDING transaction', () => {
    const tx: IntercompanyTransaction = {
      id: 'tx1', fromStoreId: 'A', toStoreId: 'B', type: 'SALE',
      amount: 1_000_000, description: null, status: 'PENDING',
      transactionDate: '2025-07-01', settledAt: null,
    }
    expect(applyAction(tx, 'confirm')).toBe('CONFIRMED')
  })

  it('rejects confirming a CONFIRMED transaction', () => {
    const tx: IntercompanyTransaction = {
      id: 'tx1', fromStoreId: 'A', toStoreId: 'B', type: 'SALE',
      amount: 1_000_000, description: null, status: 'CONFIRMED',
      transactionDate: '2025-07-01', settledAt: null,
    }
    expect(applyAction(tx, 'confirm')).toBe('Only PENDING transactions can be confirmed')
  })

  it('allows settling a CONFIRMED transaction', () => {
    const tx: IntercompanyTransaction = {
      id: 'tx1', fromStoreId: 'A', toStoreId: 'B', type: 'LOAN',
      amount: 500_000, description: null, status: 'CONFIRMED',
      transactionDate: '2025-07-01', settledAt: null,
    }
    expect(applyAction(tx, 'settle')).toBe('SETTLED')
  })

  it('rejects settling a PENDING transaction', () => {
    const tx: IntercompanyTransaction = {
      id: 'tx1', fromStoreId: 'A', toStoreId: 'B', type: 'LOAN',
      amount: 500_000, description: null, status: 'PENDING',
      transactionDate: '2025-07-01', settledAt: null,
    }
    expect(applyAction(tx, 'settle')).toBe('Only CONFIRMED transactions can be settled')
  })
})
