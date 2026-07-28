import { describe, it, expect } from 'vitest'
import {
  calcWriteOffValue,
  isValidStatusTransition,
  aggregateByReason,
  calcApprovalThreshold,
  calcStockImpact,
} from '@/components/inventory/WriteOffClient'
import type { InventoryWriteOff, WriteOffReason, WriteOffStatus } from '@/components/inventory/WriteOffClient'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeWriteOff(overrides: Partial<InventoryWriteOff> = {}): InventoryWriteOff {
  return {
    id: 'wo-1',
    storeId: 'store-1',
    productId: 'prod-1',
    productName: 'Susu UHT 1L',
    qty: 5,
    reason: 'EXPIRED' as WriteOffReason,
    costValue: 50000,
    approvedBy: null,
    approvedAt: null,
    status: 'PENDING' as WriteOffStatus,
    notes: null,
    createdAt: '2024-06-01T08:00:00Z',
    createdBy: 'Alice',
    ...overrides,
  }
}

// ── Write-off value calculation ───────────────────────────────────────────────

describe('calcWriteOffValue', () => {
  it('multiplies qty by unit cost', () => {
    expect(calcWriteOffValue(10, 5000)).toBe(50000)
  })

  it('returns 0 for zero qty', () => {
    expect(calcWriteOffValue(0, 5000)).toBe(0)
  })

  it('returns 0 for negative qty', () => {
    expect(calcWriteOffValue(-3, 5000)).toBe(0)
  })

  it('handles fractional quantities', () => {
    expect(calcWriteOffValue(2.5, 4000)).toBe(10000)
  })
})

// ── Status transition validation ──────────────────────────────────────────────

describe('isValidStatusTransition', () => {
  it('allows PENDING -> APPROVED', () => {
    expect(isValidStatusTransition('PENDING', 'APPROVED')).toBe(true)
  })

  it('allows PENDING -> REJECTED', () => {
    expect(isValidStatusTransition('PENDING', 'REJECTED')).toBe(true)
  })

  it('rejects APPROVED -> REJECTED', () => {
    expect(isValidStatusTransition('APPROVED', 'REJECTED')).toBe(false)
  })

  it('rejects REJECTED -> APPROVED', () => {
    expect(isValidStatusTransition('REJECTED', 'APPROVED')).toBe(false)
  })
})

// ── Report aggregation by reason ──────────────────────────────────────────────

describe('aggregateByReason', () => {
  it('groups write-offs by reason and sums values', () => {
    const writeOffs = [
      makeWriteOff({ id: 'wo-1', reason: 'EXPIRED', qty: 3, costValue: 30000 }),
      makeWriteOff({ id: 'wo-2', reason: 'EXPIRED', qty: 2, costValue: 20000 }),
      makeWriteOff({ id: 'wo-3', reason: 'DAMAGED', qty: 1, costValue: 15000 }),
    ]
    const rows = aggregateByReason(writeOffs)
    const expired = rows.find(r => r.reason === 'EXPIRED')
    const damaged = rows.find(r => r.reason === 'DAMAGED')
    expect(expired?.totalValue).toBe(50000)
    expect(expired?.totalQty).toBe(5)
    expect(expired?.count).toBe(2)
    expect(damaged?.totalValue).toBe(15000)
  })

  it('returns empty array for no write-offs', () => {
    expect(aggregateByReason([])).toEqual([])
  })

  it('sorts rows by totalValue descending', () => {
    const writeOffs = [
      makeWriteOff({ id: 'wo-1', reason: 'LOST', costValue: 5000 }),
      makeWriteOff({ id: 'wo-2', reason: 'EXPIRED', costValue: 80000 }),
      makeWriteOff({ id: 'wo-3', reason: 'DAMAGED', costValue: 20000 }),
    ]
    const rows = aggregateByReason(writeOffs)
    expect(rows[0].reason).toBe('EXPIRED')
    expect(rows[1].reason).toBe('DAMAGED')
    expect(rows[2].reason).toBe('LOST')
  })
})

// ── Approval threshold check ──────────────────────────────────────────────────

describe('calcApprovalThreshold', () => {
  it('returns true when cost meets threshold', () => {
    expect(calcApprovalThreshold(500000, 500000)).toBe(true)
  })

  it('returns true when cost exceeds threshold', () => {
    expect(calcApprovalThreshold(600000, 500000)).toBe(true)
  })

  it('returns false when cost is below threshold', () => {
    expect(calcApprovalThreshold(499999, 500000)).toBe(false)
  })
})

// ── Stock impact calculation ──────────────────────────────────────────────────

describe('calcStockImpact', () => {
  it('sums qty of approved write-offs for a product', () => {
    const writeOffs = [
      makeWriteOff({ id: 'wo-1', productId: 'prod-1', qty: 3, status: 'APPROVED' }),
      makeWriteOff({ id: 'wo-2', productId: 'prod-1', qty: 2, status: 'APPROVED' }),
      makeWriteOff({ id: 'wo-3', productId: 'prod-1', qty: 1, status: 'PENDING' }),
    ]
    expect(calcStockImpact(writeOffs, 'prod-1')).toBe(5)
  })

  it('ignores write-offs for other products', () => {
    const writeOffs = [
      makeWriteOff({ id: 'wo-1', productId: 'prod-1', qty: 10, status: 'APPROVED' }),
      makeWriteOff({ id: 'wo-2', productId: 'prod-2', qty: 4, status: 'APPROVED' }),
    ]
    expect(calcStockImpact(writeOffs, 'prod-2')).toBe(4)
  })

  it('returns 0 when no approved write-offs exist', () => {
    const writeOffs = [
      makeWriteOff({ id: 'wo-1', productId: 'prod-1', qty: 5, status: 'PENDING' }),
    ]
    expect(calcStockImpact(writeOffs, 'prod-1')).toBe(0)
  })
})
