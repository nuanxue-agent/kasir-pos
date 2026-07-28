import { describe, it, expect } from 'vitest'

// ── Pure business-logic helpers (mirroring API route logic) ──────────────────

function calcNetPay(
  basicPay: number,
  allowances: Record<string, number>,
  deductions: Record<string, number>,
): number {
  const totalAllowances = Object.values(allowances).reduce((s, v) => s + v, 0)
  const totalDeductions = Object.values(deductions).reduce((s, v) => s + v, 0)
  return basicPay + totalAllowances - totalDeductions
}

function aggregateAllowances(allowances: Record<string, number>): number {
  return Object.values(allowances).reduce((s, v) => s + v, 0)
}

function aggregateDeductions(deductions: Record<string, number>): number {
  return Object.values(deductions).reduce((s, v) => s + v, 0)
}

/** Days between two ISO date strings (inclusive of start, exclusive of end) */
function leaveDays(startDate: string, endDate: string): number {
  const ms = new Date(endDate).getTime() - new Date(startDate).getTime()
  return Math.round(ms / 86_400_000)
}

function leaveBalanceAfterRequest(
  currentBalance: number,
  startDate: string,
  endDate: string,
): number {
  const days = leaveDays(startDate, endDate)
  return currentBalance - days
}

/** Returns true if employee can access the payslip (own data only) */
function canAccessPayslip(
  requestingEmployeeId: string,
  payslipEmployeeId: string,
  userRole: string,
): boolean {
  if (userRole === 'OWNER' || userRole === 'MANAGER' || userRole === 'ADMIN') return true
  return requestingEmployeeId === payslipEmployeeId
}

/** Returns true if employee can access self-service data (own data only) */
function canAccessSelfService(
  requestingEmployeeId: string,
  targetEmployeeId: string,
  userRole: string,
): boolean {
  if (userRole === 'OWNER' || userRole === 'MANAGER' || userRole === 'ADMIN') return true
  return requestingEmployeeId === targetEmployeeId
}

/** Validates a bulk-issue request — returns error string or null if valid */
function validateBulkIssue(
  payslips: Array<{ id: string; status: string; netPay: number }>,
): string | null {
  if (payslips.length === 0) return 'No payslips to issue'
  const nonDraft = payslips.filter(p => p.status !== 'DRAFT')
  if (nonDraft.length > 0)
    return `${nonDraft.length} payslip(s) are not in DRAFT status`
  const negative = payslips.filter(p => p.netPay < 0)
  if (negative.length > 0)
    return `${negative.length} payslip(s) have negative net pay`
  return null
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Payslip net pay calculation', () => {
  it('calculates net pay correctly with allowances and deductions', () => {
    const net = calcNetPay(
      5_000_000,
      { 'Tunjangan Transport': 500_000, 'Tunjangan Makan': 300_000 },
      { 'BPJS Kesehatan': 100_000, 'PPh 21': 200_000 },
    )
    expect(net).toBe(5_500_000)
  })

  it('returns basic pay when no allowances or deductions', () => {
    expect(calcNetPay(4_000_000, {}, {})).toBe(4_000_000)
  })

  it('handles zero basic pay with allowances', () => {
    expect(calcNetPay(0, { Bonus: 1_000_000 }, {})).toBe(1_000_000)
  })
})

describe('Allowance / deduction aggregation', () => {
  it('sums multiple allowance entries', () => {
    expect(
      aggregateAllowances({
        'Tunjangan Transport': 500_000,
        'Tunjangan Makan': 300_000,
        'Tunjangan Jabatan': 1_000_000,
      }),
    ).toBe(1_800_000)
  })

  it('returns 0 for empty allowances', () => {
    expect(aggregateAllowances({})).toBe(0)
  })

  it('sums multiple deduction entries', () => {
    expect(
      aggregateDeductions({
        'BPJS Kesehatan': 100_000,
        'BPJS Ketenagakerjaan': 150_000,
        'PPh 21': 250_000,
      }),
    ).toBe(500_000)
  })
})

describe('Leave balance after request', () => {
  it('deducts correct number of days for a 3-day leave', () => {
    expect(leaveBalanceAfterRequest(12, '2025-08-01', '2025-08-04')).toBe(9)
  })

  it('deducts 1 day for a single-day leave', () => {
    expect(leaveBalanceAfterRequest(10, '2025-08-05', '2025-08-06')).toBe(9)
  })

  it('allows balance to go to 0', () => {
    expect(leaveBalanceAfterRequest(5, '2025-08-01', '2025-08-06')).toBe(0)
  })
})

describe('Self-service access control', () => {
  it('employee can access own payslip', () => {
    expect(canAccessPayslip('emp1', 'emp1', 'CASHIER')).toBe(true)
  })

  it('employee cannot access another employee payslip', () => {
    expect(canAccessPayslip('emp1', 'emp2', 'CASHIER')).toBe(false)
  })

  it('manager can access any employee payslip', () => {
    expect(canAccessPayslip('mgr1', 'emp2', 'MANAGER')).toBe(true)
  })

  it('owner can access any employee self-service data', () => {
    expect(canAccessSelfService('owner1', 'emp99', 'OWNER')).toBe(true)
  })

  it('employee cannot access another employee self-service data', () => {
    expect(canAccessSelfService('emp1', 'emp2', 'CASHIER')).toBe(false)
  })
})

describe('Bulk issue validation', () => {
  it('returns null for valid all-DRAFT payslips', () => {
    const payslips = [
      { id: '1', status: 'DRAFT', netPay: 5_000_000 },
      { id: '2', status: 'DRAFT', netPay: 4_500_000 },
    ]
    expect(validateBulkIssue(payslips)).toBeNull()
  })

  it('returns error when list is empty', () => {
    expect(validateBulkIssue([])).toBe('No payslips to issue')
  })

  it('returns error when some payslips are already ISSUED', () => {
    const payslips = [
      { id: '1', status: 'DRAFT', netPay: 5_000_000 },
      { id: '2', status: 'ISSUED', netPay: 4_500_000 },
    ]
    const result = validateBulkIssue(payslips)
    expect(result).toContain('1 payslip(s) are not in DRAFT status')
  })

  it('returns error when a payslip has negative net pay', () => {
    const payslips = [{ id: '1', status: 'DRAFT', netPay: -100 }]
    expect(validateBulkIssue(payslips)).toContain('negative net pay')
  })
})
