import { describe, it, expect } from 'vitest'

// ── Types ──────────────────────────────────────────────────────────────────────

type AgingBucket = 'current' | '31-60' | '61-90' | '91-120' | '120+'

interface Bill {
  id: string
  vendorId: string
  dueDate: string
  amount: number
  paidAmount: number
  status: 'DRAFT' | 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE'
}

interface Invoice {
  id: string
  customerId: string
  customerName: string
  dueDate: string
  total: number
  paidAmount: number
  status: 'DRAFT' | 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID'
}

interface AgingSummary {
  current: number
  d31_60: number
  d61_90: number
  d91_120: number
  d120plus: number
  total: number
}

// ── Pure business-logic functions (mirrors API logic) ─────────────────────────

function daysOverdue(dueDateISO: string, asOf: Date = new Date()): number {
  const due = new Date(dueDateISO)
  due.setHours(0, 0, 0, 0)
  const ref = new Date(asOf)
  ref.setHours(0, 0, 0, 0)
  return Math.floor((ref.getTime() - due.getTime()) / 86_400_000)
}

function assignBucket(days: number): AgingBucket {
  if (days <= 30) return 'current'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  if (days <= 120) return '91-120'
  return '120+'
}

function outstandingBalance(amount: number, paidAmount: number): number {
  return Math.max(0, amount - paidAmount)
}

function isOverdue(dueDate: string, asOf: Date = new Date()): boolean {
  return daysOverdue(dueDate, asOf) > 0
}

function calcAgingSummary(rows: Array<{
  current: number; d31_60: number; d61_90: number; d91_120: number; d120plus: number; total?: number
}>): AgingSummary {
  const acc = rows.reduce(
    (a, r) => ({
      current:  a.current  + r.current,
      d31_60:   a.d31_60   + r.d31_60,
      d61_90:   a.d61_90   + r.d61_90,
      d91_120:  a.d91_120  + r.d91_120,
      d120plus: a.d120plus + r.d120plus,
      total:    0,
    }),
    { current: 0, d31_60: 0, d61_90: 0, d91_120: 0, d120plus: 0, total: 0 } as AgingSummary
  )
  acc.total = acc.current + acc.d31_60 + acc.d61_90 + acc.d91_120 + acc.d120plus
  return acc
}

function groupBillsByVendor(bills: Bill[], asOf: Date): Map<string, Record<AgingBucket, number>> {
  const map = new Map<string, Record<AgingBucket, number>>()
  for (const bill of bills) {
    if (bill.status === 'PAID' || bill.status === 'DRAFT') continue
    const balance = outstandingBalance(bill.amount, bill.paidAmount)
    if (balance <= 0) continue
    const bucket = assignBucket(daysOverdue(bill.dueDate, asOf))
    if (!map.has(bill.vendorId)) {
      map.set(bill.vendorId, { current: 0, '31-60': 0, '61-90': 0, '91-120': 0, '120+': 0 })
    }
    map.get(bill.vendorId)![bucket] += balance
  }
  return map
}

// ── Reference date for all tests ──────────────────────────────────────────────
const TODAY = new Date('2025-07-15T00:00:00.000Z')

function dateOffset(days: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('daysOverdue', () => {
  it('returns 0 for due today', () => {
    expect(daysOverdue('2025-07-15', TODAY)).toBe(0)
  })

  it('returns positive for past due date', () => {
    expect(daysOverdue('2025-07-01', TODAY)).toBe(14)
  })

  it('returns negative for future due date (not yet due)', () => {
    expect(daysOverdue('2025-07-20', TODAY)).toBe(-5)
  })
})

describe('assignBucket', () => {
  it('assigns current bucket for 0 days', () => {
    expect(assignBucket(0)).toBe('current')
  })

  it('assigns current bucket for 30 days', () => {
    expect(assignBucket(30)).toBe('current')
  })

  it('assigns 31-60 bucket for 45 days', () => {
    expect(assignBucket(45)).toBe('31-60')
  })

  it('assigns 61-90 bucket for 75 days', () => {
    expect(assignBucket(75)).toBe('61-90')
  })

  it('assigns 91-120 bucket for 100 days', () => {
    expect(assignBucket(100)).toBe('91-120')
  })

  it('assigns 120+ bucket for 150 days', () => {
    expect(assignBucket(150)).toBe('120+')
  })
})

describe('outstandingBalance', () => {
  it('calculates full balance when nothing paid', () => {
    expect(outstandingBalance(1_000_000, 0)).toBe(1_000_000)
  })

  it('calculates partial balance', () => {
    expect(outstandingBalance(1_000_000, 400_000)).toBe(600_000)
  })

  it('returns 0 when fully paid', () => {
    expect(outstandingBalance(1_000_000, 1_000_000)).toBe(0)
  })
})

describe('isOverdue', () => {
  it('detects overdue bill', () => {
    expect(isOverdue('2025-07-10', TODAY)).toBe(true)
  })

  it('not overdue for future due date', () => {
    expect(isOverdue('2025-07-20', TODAY)).toBe(false)
  })
})

describe('calcAgingSummary', () => {
  it('aggregates totals correctly across multiple rows', () => {
    const rows = [
      { current: 500_000, d31_60: 200_000, d61_90: 0, d91_120: 0, d120plus: 0 },
      { current: 300_000, d31_60: 0, d61_90: 150_000, d91_120: 100_000, d120plus: 50_000 },
    ]
    const summary = calcAgingSummary(rows)
    expect(summary.current).toBe(800_000)
    expect(summary.d31_60).toBe(200_000)
    expect(summary.d61_90).toBe(150_000)
    expect(summary.d91_120).toBe(100_000)
    expect(summary.d120plus).toBe(50_000)
    expect(summary.total).toBe(1_300_000)
  })
})

describe('groupBillsByVendor (AP aging)', () => {
  it('groups outstanding bills by vendor and bucket', () => {
    const bills: Bill[] = [
      { id: 'b1', vendorId: 'v1', dueDate: dateOffset(10), amount: 500_000, paidAmount: 0, status: 'PENDING' },
      { id: 'b2', vendorId: 'v1', dueDate: dateOffset(45), amount: 300_000, paidAmount: 0, status: 'PENDING' },
      { id: 'b3', vendorId: 'v2', dueDate: dateOffset(100), amount: 200_000, paidAmount: 0, status: 'OVERDUE' },
    ]
    const map = groupBillsByVendor(bills, TODAY)
    expect(map.get('v1')!['current']).toBe(500_000)
    expect(map.get('v1')!['31-60']).toBe(300_000)
    expect(map.get('v2')!['91-120']).toBe(200_000)
  })

  it('excludes paid and draft bills', () => {
    const bills: Bill[] = [
      { id: 'b1', vendorId: 'v1', dueDate: dateOffset(50), amount: 100_000, paidAmount: 100_000, status: 'PAID' },
      { id: 'b2', vendorId: 'v1', dueDate: dateOffset(10), amount: 200_000, paidAmount: 0, status: 'DRAFT' },
    ]
    const map = groupBillsByVendor(bills, TODAY)
    expect(map.size).toBe(0)
  })
})
