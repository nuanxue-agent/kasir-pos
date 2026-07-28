import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock db so no real network calls ─────────────────────────────────────────
vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  exec: vi.fn(),
  batchExec: vi.fn(),
  newId: () => 'test-wallet-id',
  nowISO: () => '2025-01-01T00:00:00.000Z',
}))

// ── Pure wallet business-logic helpers ────────────────────────────────────────

type TxType = 'TOPUP' | 'PAYMENT' | 'REFUND' | 'ADJUSTMENT'

interface WalletTx {
  type: TxType
  amount: number  // always positive; PAYMENT direction handled by type
}

/** Compute final balance from a list of transactions */
function computeBalance(transactions: WalletTx[]): number {
  return transactions.reduce((balance, tx) => {
    if (tx.type === 'PAYMENT') return balance - tx.amount
    return balance + tx.amount   // TOPUP, REFUND, ADJUSTMENT
  }, 0)
}

/** Compute running balance array (one entry per tx) */
function computeRunningBalances(transactions: WalletTx[]): number[] {
  let running = 0
  return transactions.map(tx => {
    if (tx.type === 'PAYMENT') running -= tx.amount
    else running += tx.amount
    return running
  })
}

/** Check whether a payment can proceed */
function canPay(balance: number, amount: number): { ok: boolean; error?: string } {
  if (amount <= 0) return { ok: false, error: 'amount must be positive' }
  if (balance < amount) return { ok: false, error: 'Insufficient wallet balance' }
  return { ok: true }
}

/** Apply a payment — returns new balance or throws */
function applyPayment(balance: number, amount: number): number {
  const check = canPay(balance, amount)
  if (!check.ok) throw new Error(check.error)
  return balance - amount
}

/** Apply a refund — always increases balance */
function applyRefund(balance: number, amount: number): number {
  if (amount <= 0) throw new Error('refund amount must be positive')
  return balance + amount
}

/** Apply an admin adjustment (can be negative to deduct) */
function applyAdjustment(balance: number, delta: number): { ok: boolean; newBalance?: number; error?: string } {
  if (delta === 0) return { ok: false, error: 'adjustment amount must be non-zero' }
  const newBalance = balance + delta
  if (newBalance < 0) return { ok: false, error: 'Adjustment would result in negative balance' }
  return { ok: true, newBalance }
}

/** Validate transaction type */
function isValidTxType(type: string): type is TxType {
  return ['TOPUP', 'PAYMENT', 'REFUND', 'ADJUSTMENT'].includes(type)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CustomerWallet — balance calculation', () => {
  it('starts at zero with no transactions', () => {
    expect(computeBalance([])).toBe(0)
  })

  it('adds top-ups correctly', () => {
    const txns: WalletTx[] = [
      { type: 'TOPUP', amount: 100_000 },
      { type: 'TOPUP', amount: 50_000 },
    ]
    expect(computeBalance(txns)).toBe(150_000)
  })

  it('deducts payments correctly', () => {
    const txns: WalletTx[] = [
      { type: 'TOPUP', amount: 200_000 },
      { type: 'PAYMENT', amount: 75_000 },
    ]
    expect(computeBalance(txns)).toBe(125_000)
  })

  it('handles mixed TOPUP / PAYMENT / REFUND sequence', () => {
    const txns: WalletTx[] = [
      { type: 'TOPUP',   amount: 100_000 },
      { type: 'PAYMENT', amount: 30_000 },
      { type: 'REFUND',  amount: 30_000 },
      { type: 'PAYMENT', amount: 50_000 },
    ]
    // 100k - 30k + 30k - 50k = 50k
    expect(computeBalance(txns)).toBe(50_000)
  })
})

describe('CustomerWallet — insufficient balance prevention', () => {
  it('allows payment when balance is sufficient', () => {
    expect(canPay(100_000, 50_000).ok).toBe(true)
  })

  it('rejects payment when balance is insufficient', () => {
    const result = canPay(10_000, 50_000)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/insufficient/i)
  })

  it('rejects payment of zero or negative amount', () => {
    expect(canPay(100_000, 0).ok).toBe(false)
    expect(canPay(100_000, -1).ok).toBe(false)
  })

  it('applyPayment throws on insufficient balance', () => {
    expect(() => applyPayment(10_000, 50_000)).toThrow(/insufficient/i)
  })

  it('applyPayment returns correct balance on success', () => {
    expect(applyPayment(100_000, 30_000)).toBe(70_000)
  })
})

describe('CustomerWallet — refund logic', () => {
  it('adds refund amount back to balance', () => {
    expect(applyRefund(70_000, 30_000)).toBe(100_000)
  })

  it('rejects zero or negative refund', () => {
    expect(() => applyRefund(70_000, 0)).toThrow(/positive/)
    expect(() => applyRefund(70_000, -1)).toThrow(/positive/)
  })
})

describe('CustomerWallet — transaction type validation', () => {
  it('accepts valid transaction types', () => {
    expect(isValidTxType('TOPUP')).toBe(true)
    expect(isValidTxType('PAYMENT')).toBe(true)
    expect(isValidTxType('REFUND')).toBe(true)
    expect(isValidTxType('ADJUSTMENT')).toBe(true)
  })

  it('rejects invalid transaction types', () => {
    expect(isValidTxType('DEBIT')).toBe(false)
    expect(isValidTxType('CREDIT')).toBe(false)
    expect(isValidTxType('')).toBe(false)
    expect(isValidTxType('topup')).toBe(false)
  })
})

describe('CustomerWallet — admin adjustment', () => {
  it('applies positive adjustment (credit)', () => {
    const result = applyAdjustment(50_000, 20_000)
    expect(result.ok).toBe(true)
    expect(result.newBalance).toBe(70_000)
  })

  it('applies negative adjustment (debit)', () => {
    const result = applyAdjustment(50_000, -20_000)
    expect(result.ok).toBe(true)
    expect(result.newBalance).toBe(30_000)
  })

  it('rejects adjustment that would make balance negative', () => {
    const result = applyAdjustment(10_000, -50_000)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/negative/i)
  })

  it('rejects zero adjustment', () => {
    const result = applyAdjustment(50_000, 0)
    expect(result.ok).toBe(false)
  })
})

describe('CustomerWallet — running balance computation', () => {
  it('computes correct running balance at each step', () => {
    const txns: WalletTx[] = [
      { type: 'TOPUP',   amount: 100_000 },
      { type: 'PAYMENT', amount: 40_000 },
      { type: 'TOPUP',   amount: 50_000 },
      { type: 'PAYMENT', amount: 30_000 },
      { type: 'REFUND',  amount: 10_000 },
    ]
    const running = computeRunningBalances(txns)
    expect(running).toEqual([100_000, 60_000, 110_000, 80_000, 90_000])
  })

  it('last running balance matches computeBalance result', () => {
    const txns: WalletTx[] = [
      { type: 'TOPUP',      amount: 200_000 },
      { type: 'PAYMENT',    amount: 80_000 },
      { type: 'ADJUSTMENT', amount: -10_000 },
      { type: 'REFUND',     amount: 15_000 },
    ]
    const running = computeRunningBalances(txns)
    const finalBalance = computeBalance(txns)
    expect(running[running.length - 1]).toBe(finalBalance)
  })
})
