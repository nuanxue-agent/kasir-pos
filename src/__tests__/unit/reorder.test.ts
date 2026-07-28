import { describe, it, expect } from 'vitest'
import {
  shouldTriggerReorder,
  calcSuggestedQty,
  calcExpectedDelivery,
  buildPOFromSuggestion,
  isValidSuggestionTransition,
} from '@/app/api/reorder-suggestions/route'
import {
  stockStatusLabel,
  stockStatusColor,
} from '@/components/inventory/ReorderClient'

// ── Reorder point trigger detection ───────────────────────────────────────────

describe('shouldTriggerReorder', () => {
  it('triggers when stock equals reorder point', () => {
    expect(shouldTriggerReorder(10, 10)).toBe(true)
  })

  it('triggers when stock is below reorder point', () => {
    expect(shouldTriggerReorder(5, 10)).toBe(true)
  })

  it('does not trigger when stock is above reorder point', () => {
    expect(shouldTriggerReorder(11, 10)).toBe(false)
  })

  it('triggers when stock is zero', () => {
    expect(shouldTriggerReorder(0, 5)).toBe(true)
  })

  it('does not trigger when reorder point is zero and stock is positive', () => {
    expect(shouldTriggerReorder(1, 0)).toBe(false)
  })
})

// ── Suggested quantity calculation ────────────────────────────────────────────

describe('calcSuggestedQty', () => {
  it('returns the reorderQty as-is for a positive value', () => {
    expect(calcSuggestedQty(50)).toBe(50)
  })

  it('returns 0 for a zero reorderQty', () => {
    expect(calcSuggestedQty(0)).toBe(0)
  })

  it('floors negative values to 0', () => {
    expect(calcSuggestedQty(-10)).toBe(0)
  })

  it('handles fractional quantities', () => {
    expect(calcSuggestedQty(12.5)).toBe(12.5)
  })
})

// ── Lead time consideration ───────────────────────────────────────────────────

describe('calcExpectedDelivery', () => {
  it('adds lead time days to the reference date', () => {
    const from = new Date('2026-01-01T00:00:00Z')
    const result = calcExpectedDelivery(7, from)
    expect(result.toISOString().slice(0, 10)).toBe('2026-01-08')
  })

  it('returns the same day for zero lead time', () => {
    const from = new Date('2026-06-15T00:00:00Z')
    const result = calcExpectedDelivery(0, from)
    expect(result.toISOString().slice(0, 10)).toBe('2026-06-15')
  })

  it('floors negative lead time to zero days', () => {
    const from = new Date('2026-03-10T00:00:00Z')
    const result = calcExpectedDelivery(-5, from)
    expect(result.toISOString().slice(0, 10)).toBe('2026-03-10')
  })
})

// ── PO generation from suggestion ────────────────────────────────────────────

describe('buildPOFromSuggestion', () => {
  const suggestion = {
    id: 'sug-1',
    storeId: 'store-abc',
    productId: 'prod-xyz',
    suggestedQty: 100,
  }

  const rule = {
    preferredVendorId: 'vendor-1',
    leadTimeDays: 3,
  }

  const now = new Date('2026-07-01T00:00:00Z')

  it('builds a PO with correct storeId and vendorId', () => {
    const po = buildPOFromSuggestion(suggestion, rule, now)
    expect(po.storeId).toBe('store-abc')
    expect(po.vendorId).toBe('vendor-1')
  })

  it('includes the suggestion id in the PO payload', () => {
    const po = buildPOFromSuggestion(suggestion, rule, now)
    expect(po.suggestionId).toBe('sug-1')
  })

  it('sets PO status to DRAFT', () => {
    const po = buildPOFromSuggestion(suggestion, rule, now)
    expect(po.status).toBe('DRAFT')
  })

  it('calculates expectedDelivery from lead time', () => {
    const po = buildPOFromSuggestion(suggestion, rule, now)
    expect(po.expectedDelivery.slice(0, 10)).toBe('2026-07-04')
  })

  it('includes the product and quantity in items array', () => {
    const po = buildPOFromSuggestion(suggestion, rule, now)
    expect(po.items).toHaveLength(1)
    expect(po.items[0].productId).toBe('prod-xyz')
    expect(po.items[0].qty).toBe(100)
  })

  it('handles null preferredVendorId gracefully', () => {
    const po = buildPOFromSuggestion(suggestion, { preferredVendorId: null, leadTimeDays: 0 }, now)
    expect(po.vendorId).toBeNull()
  })
})

// ── Status transition validation ──────────────────────────────────────────────

describe('isValidSuggestionTransition', () => {
  it('allows PENDING → APPROVED', () => {
    expect(isValidSuggestionTransition('PENDING', 'APPROVED')).toBe(true)
  })

  it('allows PENDING → DISMISSED', () => {
    expect(isValidSuggestionTransition('PENDING', 'DISMISSED')).toBe(true)
  })

  it('allows APPROVED → ORDERED', () => {
    expect(isValidSuggestionTransition('APPROVED', 'ORDERED')).toBe(true)
  })

  it('allows APPROVED → DISMISSED', () => {
    expect(isValidSuggestionTransition('APPROVED', 'DISMISSED')).toBe(true)
  })

  it('rejects ORDERED → PENDING (terminal state)', () => {
    expect(isValidSuggestionTransition('ORDERED', 'PENDING')).toBe(false)
  })

  it('rejects DISMISSED → APPROVED (terminal state)', () => {
    expect(isValidSuggestionTransition('DISMISSED', 'APPROVED')).toBe(false)
  })

  it('rejects PENDING → ORDERED (skipped APPROVED step)', () => {
    expect(isValidSuggestionTransition('PENDING', 'ORDERED')).toBe(false)
  })
})

// ── Stock status label helpers ────────────────────────────────────────────────

describe('stockStatusLabel', () => {
  it('returns "Habis" when stock is zero', () => {
    expect(stockStatusLabel(0, 10)).toBe('Habis')
  })

  it('returns "Kritis" when stock equals reorder point', () => {
    expect(stockStatusLabel(10, 10)).toBe('Kritis')
  })

  it('returns "Aman" when stock is well above reorder point', () => {
    expect(stockStatusLabel(100, 10)).toBe('Aman')
  })
})
