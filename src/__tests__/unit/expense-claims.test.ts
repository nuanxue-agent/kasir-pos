import { describe, it, expect } from 'vitest'
import {
  isValidStatusTransition,
  isValidCategory,
  canApproveOrReject,
  canMarkPaid,
  calcMonthlySummary,
  calcBulkApprove,
  type ExpenseClaim,
  type ExpenseStatus,
  type ExpenseCategory,
  type UserRole,
} from '@/lib/expense-claims'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeClaim(overrides: Partial<ExpenseClaim> & { status: ExpenseStatus }): ExpenseClaim {
  const now = new Date().toISOString()
  return {
    id: overrides.id ?? 'claim-1',
    storeId: overrides.storeId ?? 'store-1',
    employeeId: overrides.employeeId ?? 'emp-1',
    title: overrides.title ?? 'Test Claim',
    amount: overrides.amount ?? 100_000,
    category: overrides.category ?? 'OTHER',
    receiptUrl: overrides.receiptUrl ?? null,
    status: overrides.status,
    submittedAt: overrides.submittedAt ?? null,
    approvedBy: overrides.approvedBy ?? null,
    paidAt: overrides.paidAt ?? null,
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

// ─── 1. Status transitions ─────────────────────────────────────────────────────

describe('isValidStatusTransition', () => {
  it('allows DRAFT → SUBMITTED', () => {
    expect(isValidStatusTransition('DRAFT', 'SUBMITTED')).toBe(true)
  })

  it('allows SUBMITTED → APPROVED', () => {
    expect(isValidStatusTransition('SUBMITTED', 'APPROVED')).toBe(true)
  })

  it('allows SUBMITTED → REJECTED', () => {
    expect(isValidStatusTransition('SUBMITTED', 'REJECTED')).toBe(true)
  })

  it('allows APPROVED → PAID', () => {
    expect(isValidStatusTransition('APPROVED', 'PAID')).toBe(true)
  })

  it('allows REJECTED → DRAFT (re-submit path)', () => {
    expect(isValidStatusTransition('REJECTED', 'DRAFT')).toBe(true)
  })

  it('rejects DRAFT → APPROVED (skips submit step)', () => {
    expect(isValidStatusTransition('DRAFT', 'APPROVED')).toBe(false)
  })

  it('rejects PAID → any (terminal state)', () => {
    expect(isValidStatusTransition('PAID', 'APPROVED')).toBe(false)
    expect(isValidStatusTransition('PAID', 'SUBMITTED')).toBe(false)
  })
})

// ─── 2. Category validation ────────────────────────────────────────────────────

describe('isValidCategory', () => {
  it('accepts all valid categories', () => {
    const valid: ExpenseCategory[] = ['TRAVEL', 'MEALS', 'SUPPLIES', 'OTHER']
    for (const cat of valid) {
      expect(isValidCategory(cat)).toBe(true)
    }
  })

  it('rejects unknown category', () => {
    expect(isValidCategory('UNKNOWN')).toBe(false)
    expect(isValidCategory('')).toBe(false)
    expect(isValidCategory('travel')).toBe(false) // case-sensitive
  })
})

// ─── 3. Approval permission check ─────────────────────────────────────────────

describe('canApproveOrReject', () => {
  it('OWNER can approve or reject', () => {
    expect(canApproveOrReject('OWNER')).toBe(true)
  })

  it('MANAGER can approve or reject', () => {
    expect(canApproveOrReject('MANAGER')).toBe(true)
  })

  it('CASHIER cannot approve or reject', () => {
    expect(canApproveOrReject('CASHIER')).toBe(false)
  })

  it('STAFF cannot approve or reject', () => {
    expect(canApproveOrReject('STAFF')).toBe(false)
  })
})

// ─── 4. Monthly total calculation ─────────────────────────────────────────────

describe('calcMonthlySummary', () => {
  it('sums submitted, approved, and paid claims for the month', () => {
    const month = '2025-06'
    const claims: ExpenseClaim[] = [
      makeClaim({ id: 'c1', employeeId: 'emp-1', amount: 50_000, status: 'SUBMITTED', submittedAt: '2025-06-01T08:00:00Z' }),
      makeClaim({ id: 'c2', employeeId: 'emp-1', amount: 75_000, status: 'APPROVED', submittedAt: '2025-06-15T08:00:00Z' }),
      makeClaim({ id: 'c3', employeeId: 'emp-1', amount: 100_000, status: 'PAID', submittedAt: '2025-06-20T08:00:00Z' }),
      makeClaim({ id: 'c4', employeeId: 'emp-1', amount: 999_000, status: 'DRAFT', createdAt: '2025-06-25T08:00:00Z' }), // excluded
    ]
    const [row] = calcMonthlySummary(claims, month)
    expect(row.totalAmount).toBe(225_000)
    expect(row.claimCount).toBe(3)
    expect(row.paidAmount).toBe(100_000)
  })

  it('excludes claims from other months', () => {
    const claims: ExpenseClaim[] = [
      makeClaim({ id: 'c1', employeeId: 'emp-1', amount: 50_000, status: 'SUBMITTED', submittedAt: '2025-05-30T08:00:00Z' }),
      makeClaim({ id: 'c2', employeeId: 'emp-1', amount: 75_000, status: 'SUBMITTED', submittedAt: '2025-07-01T08:00:00Z' }),
    ]
    const result = calcMonthlySummary(claims, '2025-06')
    expect(result).toHaveLength(0)
  })

  it('returns separate rows per employee', () => {
    const month = '2025-06'
    const claims: ExpenseClaim[] = [
      makeClaim({ id: 'c1', employeeId: 'emp-1', amount: 100_000, status: 'SUBMITTED', submittedAt: '2025-06-01T00:00:00Z' }),
      makeClaim({ id: 'c2', employeeId: 'emp-2', amount: 200_000, status: 'APPROVED', submittedAt: '2025-06-02T00:00:00Z' }),
    ]
    const result = calcMonthlySummary(claims, month)
    expect(result).toHaveLength(2)
    const emp1 = result.find(r => r.employeeId === 'emp-1')!
    const emp2 = result.find(r => r.employeeId === 'emp-2')!
    expect(emp1.totalAmount).toBe(100_000)
    expect(emp2.totalAmount).toBe(200_000)
  })
})

// ─── 5. Bulk approve ──────────────────────────────────────────────────────────

describe('calcBulkApprove', () => {
  it('approves only SUBMITTED claims and skips others', () => {
    const claims: ExpenseClaim[] = [
      makeClaim({ id: 'c1', status: 'SUBMITTED', amount: 50_000 }),
      makeClaim({ id: 'c2', status: 'SUBMITTED', amount: 75_000 }),
      makeClaim({ id: 'c3', status: 'APPROVED', amount: 100_000 }), // already approved — skip
      makeClaim({ id: 'c4', status: 'DRAFT', amount: 200_000 }),    // draft — skip
    ]
    const result = calcBulkApprove(claims, ['c1', 'c2', 'c3', 'c4'])
    expect(result.approved).toEqual(['c1', 'c2'])
    expect(result.skipped).toEqual(['c3', 'c4'])
    expect(result.totalApprovedAmount).toBe(125_000)
  })

  it('returns zero total when no SUBMITTED claims selected', () => {
    const claims: ExpenseClaim[] = [
      makeClaim({ id: 'c1', status: 'DRAFT', amount: 50_000 }),
    ]
    const result = calcBulkApprove(claims, ['c1'])
    expect(result.approved).toHaveLength(0)
    expect(result.totalApprovedAmount).toBe(0)
  })
})
