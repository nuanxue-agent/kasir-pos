import { describe, it, expect, vi } from 'vitest'

// ── Mock db so no real network calls ──────────────────────────────────────────
vi.mock('@/lib/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  exec: vi.fn(),
  batchExec: vi.fn(),
  newId: () => 'test-credit-id',
  nowISO: () => '2025-01-01T00:00:00.000Z',
}))

// ── Types ─────────────────────────────────────────────────────────────────────

type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
type TxType = 'PURCHASE' | 'PAYMENT' | 'ADJUSTMENT'

interface CreditAccount {
  id: string
  customerId: string
  storeId: string
  creditLimit: number
  balance: number
  status: AccountStatus
}

interface CreditTx {
  type: TxType
  amount: number
  createdAt: string
}

// ── Pure business-logic helpers ───────────────────────────────────────────────

/** Check whether a purchase is within the credit limit */
function canPurchase(account: CreditAccount, purchaseAmount: number): { ok: boolean; error?: string } {
  if (purchaseAmount <= 0) return { ok: false, error: 'amount must be positive' }
  if (account.status !== 'ACTIVE') return { ok: false, error: `Account is ${account.status}` }
  const newBalance = account.balance + purchaseAmount
  if (newBalance > account.creditLimit) {
    return { ok: false, error: `Exceeds credit limit. Available: ${account.creditLimit - account.balance}` }
  }
  return { ok: true }
}

/** Apply a purchase — returns new balance or throws */
function applyPurchase(account: CreditAccount, amount: number): number {
  const check = canPurchase(account, amount)
  if (!check.ok) throw new Error(check.error)
  return account.balance + amount
}

/** Check whether a payment is valid */
function canPay(account: CreditAccount, paymentAmount: number): { ok: boolean; error?: string } {
  if (paymentAmount <= 0) return { ok: false, error: 'amount must be positive' }
  if (paymentAmount > account.balance) return { ok: false, error: 'Payment exceeds outstanding balance' }
  return { ok: true }
}

/** Apply a payment — returns new balance */
function applyPayment(account: CreditAccount, amount: number): number {
  const check = canPay(account, amount)
  if (!check.ok) throw new Error(check.error)
  return account.balance - amount
}

/** Compute balance from a list of transactions */
function computeBalance(transactions: CreditTx[]): number {
  return transactions.reduce((bal, tx) => {
    if (tx.type === 'PAYMENT') return bal - tx.amount
    return bal + tx.amount   // PURCHASE and ADJUSTMENT both increase balance (amount owed)
  }, 0)
}

/** Account status transition rules */
function canTransition(from: AccountStatus, to: AccountStatus): boolean {
  if (from === to) return false
  if (from === 'CLOSED') return false  // closed is terminal
  if (from === 'SUSPENDED' && to === 'CLOSED') return true
  if (from === 'SUSPENDED' && to === 'ACTIVE') return true
  if (from === 'ACTIVE' && to === 'SUSPENDED') return true
  if (from === 'ACTIVE' && to === 'CLOSED') return true
  return false
}

/** Classify a transaction into an aging bucket (days overdue) */
type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+'

function classifyAging(createdAt: string, now: Date): AgingBucket {
  const age = Math.floor((now.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
  if (age <= 30) return 'current'
  if (age <= 60) return '1-30'
  if (age <= 90) return '31-60'
  if (age <= 120) return '61-90'
  return '90+'
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StoreCredit — credit limit enforcement', () => {
  it('allows purchase within credit limit', () => {
    const account: CreditAccount = { id: '1', customerId: 'c1', storeId: 's1', creditLimit: 1_000_000, balance: 0, status: 'ACTIVE' }
    expect(canPurchase(account, 500_000).ok).toBe(true)
  })

  it('rejects purchase that would exceed credit limit', () => {
    const account: CreditAccount = { id: '1', customerId: 'c1', storeId: 's1', creditLimit: 500_000, balance: 400_000, status: 'ACTIVE' }
    const result = canPurchase(account, 200_000)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/exceed/i)
  })

  it('allows purchase that exactly hits the credit limit', () => {
    const account: CreditAccount = { id: '1', customerId: 'c1', storeId: 's1', creditLimit: 500_000, balance: 0, status: 'ACTIVE' }
    expect(canPurchase(account, 500_000).ok).toBe(true)
  })

  it('rejects purchase on SUSPENDED account', () => {
    const account: CreditAccount = { id: '1', customerId: 'c1', storeId: 's1', creditLimit: 1_000_000, balance: 0, status: 'SUSPENDED' }
    const result = canPurchase(account, 100_000)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/suspended/i)
  })
})

describe('StoreCredit — balance calculation after transactions', () => {
  it('starts at zero with no transactions', () => {
    expect(computeBalance([])).toBe(0)
  })

  it('increases balance on purchase', () => {
    const txns: CreditTx[] = [
      { type: 'PURCHASE', amount: 200_000, createdAt: '2025-01-01T00:00:00Z' },
      { type: 'PURCHASE', amount: 150_000, createdAt: '2025-01-02T00:00:00Z' },
    ]
    expect(computeBalance(txns)).toBe(350_000)
  })

  it('reduces balance on payment', () => {
    const txns: CreditTx[] = [
      { type: 'PURCHASE', amount: 500_000, createdAt: '2025-01-01T00:00:00Z' },
      { type: 'PAYMENT',  amount: 200_000, createdAt: '2025-01-05T00:00:00Z' },
    ]
    expect(computeBalance(txns)).toBe(300_000)
  })
})

describe('StoreCredit — aging bucket classification', () => {
  const now = new Date('2025-04-01T00:00:00Z')

  it('classifies a transaction from today as current', () => {
    expect(classifyAging('2025-04-01T00:00:00Z', now)).toBe('current')
  })

  it('classifies a 25-day-old transaction as current', () => {
    expect(classifyAging('2025-03-07T00:00:00Z', now)).toBe('current')
  })

  it('classifies a 45-day-old transaction as 1-30', () => {
    expect(classifyAging('2025-02-14T00:00:00Z', now)).toBe('1-30')
  })

  it('classifies a 100-day-old transaction as 61-90', () => {
    expect(classifyAging('2024-12-22T00:00:00Z', now)).toBe('61-90')
  })

  it('classifies a 130-day-old transaction as 90+', () => {
    expect(classifyAging('2024-11-22T00:00:00Z', now)).toBe('90+')
  })
})

describe('StoreCredit — payment recording', () => {
  it('records payment and returns reduced balance', () => {
    const account: CreditAccount = { id: '1', customerId: 'c1', storeId: 's1', creditLimit: 1_000_000, balance: 500_000, status: 'ACTIVE' }
    expect(applyPayment(account, 200_000)).toBe(300_000)
  })

  it('rejects payment exceeding outstanding balance', () => {
    const account: CreditAccount = { id: '1', customerId: 'c1', storeId: 's1', creditLimit: 1_000_000, balance: 100_000, status: 'ACTIVE' }
    expect(() => applyPayment(account, 200_000)).toThrow(/exceed/i)
  })

  it('allows full balance payment (clears debt)', () => {
    const account: CreditAccount = { id: '1', customerId: 'c1', storeId: 's1', creditLimit: 1_000_000, balance: 300_000, status: 'ACTIVE' }
    expect(applyPayment(account, 300_000)).toBe(0)
  })
})

describe('StoreCredit — account status transitions', () => {
  it('allows ACTIVE -> SUSPENDED', () => {
    expect(canTransition('ACTIVE', 'SUSPENDED')).toBe(true)
  })

  it('allows ACTIVE -> CLOSED', () => {
    expect(canTransition('ACTIVE', 'CLOSED')).toBe(true)
  })

  it('allows SUSPENDED -> ACTIVE (reinstate)', () => {
    expect(canTransition('SUSPENDED', 'ACTIVE')).toBe(true)
  })

  it('blocks re-opening a CLOSED account', () => {
    expect(canTransition('CLOSED', 'ACTIVE')).toBe(false)
    expect(canTransition('CLOSED', 'SUSPENDED')).toBe(false)
  })

  it('blocks no-op transition to same status', () => {
    expect(canTransition('ACTIVE', 'ACTIVE')).toBe(false)
  })
})
