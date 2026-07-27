import { describe, it, expect } from 'vitest'
import {
  getPlanLimits,
  isFeatureAllowed,
  checkProductLimit,
  checkStoreLimit,
  usagePercent,
  planLabel,
  type Plan,
  type Feature,
} from '@/lib/plan'

// ── getPlanLimits ─────────────────────────────────────────────────────────────

describe('getPlanLimits', () => {
  it('FREE plan has 1 store, 100 products, 1 cashier', () => {
    const limits = getPlanLimits('FREE')
    expect(limits.maxStores).toBe(1)
    expect(limits.maxProducts).toBe(100)
    expect(limits.maxCashiers).toBe(1)
  })

  it('PRO plan has 3 stores and unlimited products', () => {
    const limits = getPlanLimits('PRO')
    expect(limits.maxStores).toBe(3)
    expect(limits.maxProducts).toBe(-1)
  })

  it('ENTERPRISE plan has unlimited stores, products, and cashiers', () => {
    const limits = getPlanLimits('ENTERPRISE')
    expect(limits.maxStores).toBe(-1)
    expect(limits.maxProducts).toBe(-1)
    expect(limits.maxCashiers).toBe(-1)
  })
})

// ── checkProductLimit ─────────────────────────────────────────────────────────

describe('checkProductLimit', () => {
  it('FREE plan allows adding product when below limit', () => {
    expect(checkProductLimit('FREE', 99)).toBe(true)
  })

  it('FREE plan blocks adding product at the limit (100)', () => {
    expect(checkProductLimit('FREE', 100)).toBe(false)
  })

  it('FREE plan blocks adding product above the limit', () => {
    expect(checkProductLimit('FREE', 150)).toBe(false)
  })

  it('PRO plan always allows adding products (unlimited)', () => {
    expect(checkProductLimit('PRO', 99999)).toBe(true)
  })

  it('ENTERPRISE plan always allows adding products (unlimited)', () => {
    expect(checkProductLimit('ENTERPRISE', 1_000_000)).toBe(true)
  })
})

// ── checkStoreLimit ───────────────────────────────────────────────────────────

describe('checkStoreLimit', () => {
  it('FREE plan blocks second store', () => {
    expect(checkStoreLimit('FREE', 1)).toBe(false)
  })

  it('FREE plan allows first store', () => {
    expect(checkStoreLimit('FREE', 0)).toBe(true)
  })

  it('PRO plan allows up to 3 stores', () => {
    expect(checkStoreLimit('PRO', 2)).toBe(true)
    expect(checkStoreLimit('PRO', 3)).toBe(false)
  })

  it('ENTERPRISE plan always allows more stores', () => {
    expect(checkStoreLimit('ENTERPRISE', 500)).toBe(true)
  })
})

// ── isFeatureAllowed ──────────────────────────────────────────────────────────

describe('isFeatureAllowed', () => {
  it('FREE plan does not allow MULTI_STORE', () => {
    expect(isFeatureAllowed('FREE', 'MULTI_STORE')).toBe(false)
  })

  it('FREE plan does not allow ADVANCED_REPORTS', () => {
    expect(isFeatureAllowed('FREE', 'ADVANCED_REPORTS')).toBe(false)
  })

  it('PRO plan allows ADVANCED_REPORTS', () => {
    expect(isFeatureAllowed('PRO', 'ADVANCED_REPORTS')).toBe(true)
  })

  it('PRO plan does not allow WHITE_LABEL', () => {
    expect(isFeatureAllowed('PRO', 'WHITE_LABEL')).toBe(false)
  })

  it('ENTERPRISE plan allows WHITE_LABEL', () => {
    expect(isFeatureAllowed('ENTERPRISE', 'WHITE_LABEL')).toBe(true)
  })

  it('ENTERPRISE plan allows MANUFACTURING', () => {
    expect(isFeatureAllowed('ENTERPRISE', 'MANUFACTURING')).toBe(true)
  })
})

// ── usagePercent ──────────────────────────────────────────────────────────────

describe('usagePercent', () => {
  it('returns 0 when limit is unlimited (-1)', () => {
    expect(usagePercent(-1, 9999)).toBe(0)
  })

  it('returns correct percentage for partial usage', () => {
    expect(usagePercent(100, 50)).toBe(50)
  })

  it('returns 100 when at limit', () => {
    expect(usagePercent(100, 100)).toBe(100)
  })

  it('caps at 100 when over the limit', () => {
    expect(usagePercent(100, 150)).toBe(100)
  })
})

// ── planLabel ─────────────────────────────────────────────────────────────────

describe('planLabel', () => {
  it('returns Indonesian labels for each plan', () => {
    expect(planLabel('FREE')).toBe('Gratis')
    expect(planLabel('PRO')).toBe('Pro')
    expect(planLabel('ENTERPRISE')).toBe('Enterprise')
  })
})
