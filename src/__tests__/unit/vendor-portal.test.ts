import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type POStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'ORDERED' | 'RECEIVED' | 'CANCELLED'

interface Vendor {
  id: string
  storeId: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  paymentTerms: string | null
  leadTimeDays: number
  rating: number
  active: number
}

interface PurchaseOrder {
  id: string
  storeId: string
  supplierId: string
  status: POStatus
  subtotal: number
  taxAmt: number
  total: number
  expectedDate: string | null
  createdAt: string
}

interface POApproval {
  id: string
  poId: string
  userId: string
  action: 'APPROVED' | 'REJECTED'
  notes: string | null
  createdAt: string
}

// ── Pure business-logic functions (mirrors API logic) ─────────────────────────

const VALID_TRANSITIONS: Record<POStatus, POStatus[]> = {
  DRAFT:     ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['APPROVED', 'DRAFT', 'CANCELLED'],  // DRAFT = rejected back
  APPROVED:  ['ORDERED', 'CANCELLED'],
  ORDERED:   ['RECEIVED', 'CANCELLED'],
  RECEIVED:  [],
  CANCELLED: [],
}

function canTransition(from: POStatus, to: POStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

function canApprove(role: string): boolean {
  return ['OWNER', 'MANAGER'].includes(role)
}

function calcLeadTimeArrival(orderDate: string, leadTimeDays: number): Date {
  const d = new Date(orderDate)
  d.setDate(d.getDate() + leadTimeDays)
  return d
}

function calcPOTotal(subtotal: number, taxRate: number): { taxAmt: number; total: number } {
  const taxAmt = Math.round(subtotal * taxRate)
  return { taxAmt, total: subtotal + taxAmt }
}

function aggregateVendorRating(ratings: number[]): number {
  if (ratings.length === 0) return 0
  const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length
  return Math.round(avg * 10) / 10
}

function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5
}

function getEstimatedArrival(po: PurchaseOrder, vendor: Vendor): Date | null {
  if (!po.expectedDate) return null
  return calcLeadTimeArrival(po.expectedDate, vendor.leadTimeDays)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PO status transition validation', () => {
  it('allows DRAFT → SUBMITTED', () => {
    expect(canTransition('DRAFT', 'SUBMITTED')).toBe(true)
  })

  it('allows SUBMITTED → APPROVED', () => {
    expect(canTransition('SUBMITTED', 'APPROVED')).toBe(true)
  })

  it('allows APPROVED → ORDERED', () => {
    expect(canTransition('APPROVED', 'ORDERED')).toBe(true)
  })

  it('allows ORDERED → RECEIVED', () => {
    expect(canTransition('ORDERED', 'RECEIVED')).toBe(true)
  })

  it('blocks DRAFT → APPROVED (must go through SUBMITTED)', () => {
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false)
  })

  it('blocks RECEIVED → CANCELLED (terminal state)', () => {
    expect(canTransition('RECEIVED', 'CANCELLED')).toBe(false)
  })

  it('allows DRAFT → CANCELLED', () => {
    expect(canTransition('DRAFT', 'CANCELLED')).toBe(true)
  })
})

describe('Approval permission check', () => {
  it('allows OWNER to approve', () => {
    expect(canApprove('OWNER')).toBe(true)
  })

  it('allows MANAGER to approve', () => {
    expect(canApprove('MANAGER')).toBe(true)
  })

  it('blocks CASHIER from approving', () => {
    expect(canApprove('CASHIER')).toBe(false)
  })

  it('blocks STAFF from approving', () => {
    expect(canApprove('STAFF')).toBe(false)
  })
})

describe('Lead time calculation', () => {
  it('calculates arrival date correctly', () => {
    const arrival = calcLeadTimeArrival('2024-01-01', 7)
    expect(arrival.toISOString().slice(0, 10)).toBe('2024-01-08')
  })

  it('handles 30-day lead time spanning month boundary', () => {
    const arrival = calcLeadTimeArrival('2024-01-15', 30)
    expect(arrival.toISOString().slice(0, 10)).toBe('2024-02-14')
  })

  it('returns null estimated arrival when no expectedDate', () => {
    const vendor: Vendor = { id: 'v1', storeId: 's1', name: 'V', email: null, phone: null, address: null, paymentTerms: 'NET30', leadTimeDays: 7, rating: 4, active: 1 }
    const po: PurchaseOrder = { id: 'po1', storeId: 's1', supplierId: 'v1', status: 'DRAFT', subtotal: 100000, taxAmt: 0, total: 100000, expectedDate: null, createdAt: '2024-01-01T00:00:00Z' }
    expect(getEstimatedArrival(po, vendor)).toBeNull()
  })
})

describe('Vendor rating aggregation', () => {
  it('returns 0 for no ratings', () => {
    expect(aggregateVendorRating([])).toBe(0)
  })

  it('computes average correctly', () => {
    expect(aggregateVendorRating([4, 5, 3])).toBe(4)
  })

  it('rounds to 1 decimal place', () => {
    expect(aggregateVendorRating([4, 5])).toBe(4.5)
  })

  it('validates rating range 1-5', () => {
    expect(isValidRating(1)).toBe(true)
    expect(isValidRating(5)).toBe(true)
    expect(isValidRating(0)).toBe(false)
    expect(isValidRating(6)).toBe(false)
  })
})

describe('PO total with tax', () => {
  it('calculates 11% PPN correctly', () => {
    const { taxAmt, total } = calcPOTotal(1_000_000, 0.11)
    expect(taxAmt).toBe(110_000)
    expect(total).toBe(1_110_000)
  })

  it('rounds tax amount to nearest integer', () => {
    const { taxAmt } = calcPOTotal(100_001, 0.11)
    expect(Number.isInteger(taxAmt)).toBe(true)
  })

  it('handles zero tax rate', () => {
    const { taxAmt, total } = calcPOTotal(500_000, 0)
    expect(taxAmt).toBe(0)
    expect(total).toBe(500_000)
  })
})
