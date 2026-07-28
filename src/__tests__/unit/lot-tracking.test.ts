import { describe, it, expect } from 'vitest'
import {
  daysUntilExpiry,
  isExpiringWithin,
  isExpired,
  fefoSort,
  buildFefoPickPlan,
  getExpiryAlerts,
  deriveStatus,
  isValidStatusTransition,
  applyPick,
} from '@/lib/lot-tracking'
import type { Lot } from '@/lib/lot-tracking'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLot(overrides: Partial<Lot> = {}): Lot {
  return {
    id:          overrides.id          ?? 'lot-1',
    storeId:     overrides.storeId     ?? 'store-1',
    productId:   overrides.productId   ?? 'prod-1',
    lotNumber:   overrides.lotNumber   ?? 'LOT-001',
    expiryDate:  overrides.expiryDate  ?? '2099-12-31',
    receivedDate: overrides.receivedDate ?? '2024-01-01',
    initialQty:  overrides.initialQty  ?? 100,
    remainingQty: overrides.remainingQty ?? 100,
    supplierId:  overrides.supplierId  ?? null,
    costPerUnit: overrides.costPerUnit ?? 5000,
    status:      overrides.status      ?? 'ACTIVE',
    createdAt:   overrides.createdAt   ?? '2024-01-01T00:00:00Z',
    updatedAt:   overrides.updatedAt   ?? '2024-01-01T00:00:00Z',
  }
}

// Fixed reference date: 2025-07-15 UTC
const NOW = new Date(Date.UTC(2025, 6, 15))

// ── 1. FEFO ordering logic ────────────────────────────────────────────────────

describe('fefoSort', () => {
  it('sorts active lots by nearest expiry date first', () => {
    const lotA = makeLot({ id: 'a', expiryDate: '2025-09-01', status: 'ACTIVE' })
    const lotB = makeLot({ id: 'b', expiryDate: '2025-08-01', status: 'ACTIVE' })
    const lotC = makeLot({ id: 'c', expiryDate: '2025-10-01', status: 'ACTIVE' })
    const result = fefoSort([lotA, lotB, lotC], NOW)
    expect(result.map(l => l.id)).toEqual(['b', 'a', 'c'])
  })

  it('sub-sorts by receivedDate when expiry is equal', () => {
    const lotA = makeLot({ id: 'a', expiryDate: '2025-09-01', receivedDate: '2024-03-01', status: 'ACTIVE' })
    const lotB = makeLot({ id: 'b', expiryDate: '2025-09-01', receivedDate: '2024-01-01', status: 'ACTIVE' })
    const result = fefoSort([lotA, lotB], NOW)
    expect(result.map(l => l.id)).toEqual(['b', 'a'])
  })

  it('excludes expired, depleted, and zero-qty lots', () => {
    const expired  = makeLot({ id: 'exp',  expiryDate: '2024-01-01', status: 'ACTIVE' })  // expired by date
    const depleted = makeLot({ id: 'dep',  status: 'DEPLETED', remainingQty: 0 })
    const zero     = makeLot({ id: 'zero', remainingQty: 0, status: 'ACTIVE' })
    const active   = makeLot({ id: 'ok',   expiryDate: '2025-09-01', status: 'ACTIVE' })
    const result   = fefoSort([expired, depleted, zero, active], NOW)
    expect(result.map(l => l.id)).toEqual(['ok'])
  })
})

// ── 2. Expiry date proximity calculation ──────────────────────────────────────

describe('daysUntilExpiry', () => {
  it('calculates days correctly for a future date', () => {
    // 2025-07-25 is 10 days after NOW (2025-07-15)
    expect(daysUntilExpiry('2025-07-25', NOW)).toBe(10)
  })

  it('returns 0 for expiry on the same day', () => {
    expect(daysUntilExpiry('2025-07-15', NOW)).toBe(0)
  })

  it('returns negative for an already-expired date', () => {
    expect(daysUntilExpiry('2025-07-10', NOW)).toBeLessThan(0)
  })
})

describe('isExpiringWithin', () => {
  it('returns true when expiry is within threshold days', () => {
    expect(isExpiringWithin('2025-07-25', 30, NOW)).toBe(true)   // 10 days away, within 30
  })

  it('returns false when expiry is beyond threshold days', () => {
    expect(isExpiringWithin('2025-09-30', 30, NOW)).toBe(false)  // >30 days away
  })

  it('returns false for already-expired lots', () => {
    expect(isExpiringWithin('2025-07-01', 30, NOW)).toBe(false)
  })
})

// ── 3. Lot status transitions ─────────────────────────────────────────────────

describe('isValidStatusTransition', () => {
  it('allows ACTIVE → EXPIRED', () => {
    expect(isValidStatusTransition('ACTIVE', 'EXPIRED')).toBe(true)
  })

  it('allows ACTIVE → DEPLETED', () => {
    expect(isValidStatusTransition('ACTIVE', 'DEPLETED')).toBe(true)
  })

  it('allows EXPIRED → ACTIVE (correction)', () => {
    expect(isValidStatusTransition('EXPIRED', 'ACTIVE')).toBe(true)
  })

  it('blocks DEPLETED → ACTIVE (terminal state)', () => {
    expect(isValidStatusTransition('DEPLETED', 'ACTIVE')).toBe(false)
  })

  it('blocks DEPLETED → EXPIRED (terminal state)', () => {
    expect(isValidStatusTransition('DEPLETED', 'EXPIRED')).toBe(false)
  })
})

describe('deriveStatus', () => {
  it('returns DEPLETED when remainingQty is 0', () => {
    expect(deriveStatus({ remainingQty: 0, expiryDate: '2099-01-01' }, NOW)).toBe('DEPLETED')
  })

  it('returns EXPIRED when expiryDate is in the past and qty > 0', () => {
    expect(deriveStatus({ remainingQty: 10, expiryDate: '2024-01-01' }, NOW)).toBe('EXPIRED')
  })

  it('returns ACTIVE when qty > 0 and not expired', () => {
    expect(deriveStatus({ remainingQty: 10, expiryDate: '2099-01-01' }, NOW)).toBe('ACTIVE')
  })
})

// ── 4. Remaining quantity after pick ──────────────────────────────────────────

describe('applyPick', () => {
  it('reduces remainingQty by pickQty', () => {
    const lot = makeLot({ remainingQty: 50 })
    expect(applyPick(lot, 20)).toBe(30)
  })

  it('allows picking exactly the remaining qty', () => {
    const lot = makeLot({ remainingQty: 50 })
    expect(applyPick(lot, 50)).toBe(0)
  })

  it('throws when pickQty exceeds remainingQty', () => {
    const lot = makeLot({ remainingQty: 10 })
    expect(() => applyPick(lot, 15)).toThrow('pickQty exceeds remainingQty')
  })

  it('throws for non-positive pickQty', () => {
    const lot = makeLot({ remainingQty: 50 })
    expect(() => applyPick(lot, 0)).toThrow('pickQty must be positive')
  })
})

// ── 5. FEFO pick plan ─────────────────────────────────────────────────────────

describe('buildFefoPickPlan', () => {
  it('builds a single-lot plan when one lot is sufficient', () => {
    const lot  = makeLot({ id: 'a', expiryDate: '2025-09-01', remainingQty: 100 })
    const plan = buildFefoPickPlan([lot], 40, NOW)
    expect(plan).toHaveLength(1)
    expect(plan[0].pickQty).toBe(40)
  })

  it('spans multiple lots in FEFO order when needed', () => {
    const lotA = makeLot({ id: 'a', expiryDate: '2025-09-01', remainingQty: 30 })
    const lotB = makeLot({ id: 'b', expiryDate: '2025-08-01', remainingQty: 50 })
    const plan = buildFefoPickPlan([lotA, lotB], 60, NOW)
    // lotB expires sooner → picked first
    expect(plan[0].lot.id).toBe('b')
    expect(plan[0].pickQty).toBe(50)
    expect(plan[1].lot.id).toBe('a')
    expect(plan[1].pickQty).toBe(10)
  })

  it('returns empty plan for zero requestedQty', () => {
    const lot  = makeLot({ remainingQty: 100 })
    expect(buildFefoPickPlan([lot], 0, NOW)).toHaveLength(0)
  })
})

// ── 6. Expiry alert threshold ─────────────────────────────────────────────────

describe('getExpiryAlerts', () => {
  it('returns lots expiring within threshold, sorted nearest first', () => {
    const lot10 = makeLot({ id: 'a', expiryDate: '2025-07-25', status: 'ACTIVE', remainingQty: 10 }) // 10d
    const lot20 = makeLot({ id: 'b', expiryDate: '2025-08-04', status: 'ACTIVE', remainingQty: 20 }) // 20d
    const lot40 = makeLot({ id: 'c', expiryDate: '2025-08-24', status: 'ACTIVE', remainingQty: 5  }) // 40d
    const alerts = getExpiryAlerts([lot10, lot20, lot40], 30, NOW)
    expect(alerts.map(a => a.lot.id)).toEqual(['a', 'b'])
    expect(alerts[0].daysUntilExpiry).toBe(10)
    expect(alerts[1].daysUntilExpiry).toBe(20)
  })

  it('excludes depleted and expired lots from alerts', () => {
    const depleted = makeLot({ id: 'd', expiryDate: '2025-07-20', status: 'DEPLETED', remainingQty: 0 })
    const expiredS = makeLot({ id: 'e', expiryDate: '2025-07-01', status: 'EXPIRED',  remainingQty: 5 })
    const alerts   = getExpiryAlerts([depleted, expiredS], 30, NOW)
    expect(alerts).toHaveLength(0)
  })

  it('returns empty when no lots fall within threshold', () => {
    const far = makeLot({ id: 'f', expiryDate: '2026-01-01', status: 'ACTIVE', remainingQty: 10 })
    expect(getExpiryAlerts([far], 30, NOW)).toHaveLength(0)
  })
})
