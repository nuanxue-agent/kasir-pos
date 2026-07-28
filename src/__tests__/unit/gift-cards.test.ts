import { describe, it, expect } from 'vitest'
import { generateCode } from '@/app/api/gift-cards/route'

// ── Pure helpers (extracted logic matching API routes) ────────────────────────

type CardStatus = 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'VOIDED'

interface GiftCard {
  id: string
  code: string
  initialBalance: number
  currentBalance: number
  status: CardStatus
  expiresAt: string | null
}

function redeemCard(card: GiftCard, amount: number): { card: GiftCard; error?: string } {
  if (card.status === 'VOIDED')    return { card, error: 'Gift card has been voided' }
  if (card.status === 'REDEEMED')  return { card, error: 'Gift card has already been fully redeemed' }
  if (card.status === 'EXPIRED')   return { card, error: 'Gift card has expired' }
  if (card.expiresAt && new Date(card.expiresAt) < new Date()) {
    return { card: { ...card, status: 'EXPIRED' }, error: 'Gift card has expired' }
  }
  if (card.status !== 'ACTIVE')    return { card, error: 'Gift card is not active' }
  if (card.currentBalance <= 0)    return { card, error: 'Gift card has no remaining balance' }
  if (amount > card.currentBalance) return { card, error: `Insufficient balance. Available: ${card.currentBalance}` }

  const newBalance = card.currentBalance - amount
  return {
    card: {
      ...card,
      currentBalance: newBalance,
      status: newBalance === 0 ? 'REDEEMED' : 'ACTIVE',
    },
  }
}

function isExpired(card: GiftCard): boolean {
  if (card.status === 'EXPIRED') return true
  if (card.expiresAt && new Date(card.expiresAt) < new Date()) return true
  return false
}

function voidCard(card: GiftCard): { card: GiftCard; error?: string } {
  if (card.status === 'VOIDED') return { card, error: 'Card is already voided' }
  return { card: { ...card, status: 'VOIDED', currentBalance: 0 } }
}

function refundCard(card: GiftCard, amount: number): { card: GiftCard; error?: string } {
  if (card.status === 'VOIDED') return { card, error: 'Card is already voided' }
  if (amount <= 0) return { card, error: 'amount must be > 0 for REFUND' }
  const newBalance = Math.min(card.initialBalance, card.currentBalance + amount)
  return { card: { ...card, currentBalance: newBalance, status: newBalance > 0 ? 'ACTIVE' : card.status } }
}

function makeCard(overrides: Partial<GiftCard> = {}): GiftCard {
  return {
    id: 'test-id',
    code: 'GC-TEST-1234-ABCD',
    initialBalance: 100_000,
    currentBalance: 100_000,
    status: 'ACTIVE',
    expiresAt: null,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Gift Card — Balance after redemption', () => {
  it('reduces currentBalance by amount redeemed', () => {
    const card = makeCard()
    const { card: updated } = redeemCard(card, 30_000)
    expect(updated.currentBalance).toBe(70_000)
  })

  it('sets status to REDEEMED when balance reaches zero', () => {
    const card = makeCard()
    const { card: updated } = redeemCard(card, 100_000)
    expect(updated.status).toBe('REDEEMED')
    expect(updated.currentBalance).toBe(0)
  })
})

describe('Gift Card — Expiry check', () => {
  it('rejects redemption on an expired card (status)', () => {
    const card = makeCard({ status: 'EXPIRED' })
    const { error } = redeemCard(card, 10_000)
    expect(error).toMatch(/expired/i)
  })

  it('detects expiry from expiresAt date in the past', () => {
    const card = makeCard({ expiresAt: '2000-01-01T00:00:00Z' })
    expect(isExpired(card)).toBe(true)
  })

  it('does not treat a future expiresAt as expired', () => {
    const card = makeCard({ expiresAt: '2099-01-01T00:00:00Z' })
    expect(isExpired(card)).toBe(false)
  })
})

describe('Gift Card — Partial redemption', () => {
  it('allows partial spend and keeps card ACTIVE', () => {
    const card = makeCard({ currentBalance: 50_000 })
    const { card: updated, error } = redeemCard(card, 20_000)
    expect(error).toBeUndefined()
    expect(updated.currentBalance).toBe(30_000)
    expect(updated.status).toBe('ACTIVE')
  })

  it('rejects amount exceeding balance', () => {
    const card = makeCard({ currentBalance: 10_000 })
    const { error } = redeemCard(card, 50_000)
    expect(error).toMatch(/insufficient/i)
  })
})

describe('Gift Card — Status transitions', () => {
  it('voids an active card', () => {
    const card = makeCard()
    const { card: updated, error } = voidCard(card)
    expect(error).toBeUndefined()
    expect(updated.status).toBe('VOIDED')
    expect(updated.currentBalance).toBe(0)
  })

  it('cannot redeem a voided card', () => {
    const card = makeCard({ status: 'VOIDED' })
    const { error } = redeemCard(card, 10_000)
    expect(error).toMatch(/voided/i)
  })

  it('refund restores balance and sets status to ACTIVE', () => {
    const card = makeCard({ currentBalance: 0, status: 'REDEEMED' })
    const { card: updated } = refundCard(card, 50_000)
    expect(updated.currentBalance).toBe(50_000)
    expect(updated.status).toBe('ACTIVE')
  })
})

describe('Gift Card — Code generation/validation', () => {
  it('generates a code matching GC-XXXX-XXXX-XXXX format', () => {
    const code = generateCode()
    expect(code).toMatch(/^GC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  })

  it('generates unique codes on successive calls', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateCode()))
    expect(codes.size).toBe(50)
  })
})
