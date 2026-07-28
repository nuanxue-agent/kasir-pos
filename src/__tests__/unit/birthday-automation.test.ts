import { describe, it, expect } from 'vitest'
import {
  daysUntilNextBirthday,
  calcTriggerDate,
  isUpcomingBirthday,
  calcRewardValue,
  isValidQueueTransition,
  getUpcomingCustomers,
  formatTriggerLabel,
} from '@/lib/birthday-automation'
import type { CustomerBirthday, TriggerType } from '@/lib/birthday-automation'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDate(monthOffset: number, from = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + monthOffset)
  // Return as YYYY-MM-DD using the birthday year shifted back (so it looks like a real birthday)
  // We keep the month/day but use a past year so daysUntilNextBirthday computes forward correctly
  return `1990-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TODAY = new Date('2025-06-15')

// ── 1. daysUntilNextBirthday ──────────────────────────────────────────────────

describe('daysUntilNextBirthday', () => {
  it('returns 0 when birthday is today', () => {
    const bd = '1990-06-15'
    expect(daysUntilNextBirthday(bd, TODAY)).toBe(0)
  })

  it('returns positive days when birthday is upcoming this year', () => {
    const bd = '1990-06-20'
    expect(daysUntilNextBirthday(bd, TODAY)).toBe(5)
  })

  it('wraps around to next year when birthday already passed this year', () => {
    const bd = '1990-03-10' // already passed in June
    const days = daysUntilNextBirthday(bd, TODAY)
    // Should be ~March 10 next year — well over 200 days
    expect(days).toBeGreaterThan(200)
    expect(days).toBeLessThan(366)
  })

  it('returns 1 for birthday tomorrow', () => {
    const bd = '1985-06-16'
    expect(daysUntilNextBirthday(bd, TODAY)).toBe(1)
  })
})

// ── 2. calcTriggerDate ────────────────────────────────────────────────────────

describe('calcTriggerDate', () => {
  it('returns event date when daysBeforeTrigger is 0', () => {
    expect(calcTriggerDate('1990-06-20', 0, 2025)).toBe('2025-06-20')
  })

  it('returns correct date N days before event', () => {
    expect(calcTriggerDate('1990-06-20', 3, 2025)).toBe('2025-06-17')
  })

  it('handles month boundary correctly', () => {
    // 2 days before July 1 = June 29
    expect(calcTriggerDate('1990-07-01', 2, 2025)).toBe('2025-06-29')
  })

  it('uses the specified year for the trigger', () => {
    const result = calcTriggerDate('1990-12-25', 5, 2026)
    expect(result).toBe('2026-12-20')
  })
})

// ── 3. isUpcomingBirthday ────────────────────────────────────────────────────

describe('isUpcomingBirthday', () => {
  const customer: CustomerBirthday = {
    customerId: 'c1',
    name: 'Budi',
    birthday: '1990-06-25',          // 10 days from TODAY
    anniversaryDate: '2020-07-10',   // 25 days from TODAY
    signupDate: '2021-06-10',        // already passed
  }

  it('detects BIRTHDAY within window', () => {
    expect(isUpcomingBirthday(customer, 'BIRTHDAY', 30, TODAY)).toBe(true)
  })

  it('detects ANNIVERSARY within window', () => {
    expect(isUpcomingBirthday(customer, 'ANNIVERSARY', 30, TODAY)).toBe(true)
  })

  it('returns false when event is beyond window', () => {
    expect(isUpcomingBirthday(customer, 'BIRTHDAY', 5, TODAY)).toBe(false)
  })

  it('returns false when date field is null', () => {
    const c2: CustomerBirthday = { customerId: 'c2', name: 'Ani', birthday: null }
    expect(isUpcomingBirthday(c2, 'BIRTHDAY', 30, TODAY)).toBe(false)
  })
})

// ── 4. calcRewardValue ───────────────────────────────────────────────────────

describe('calcRewardValue', () => {
  it('returns fixed amount for VOUCHER regardless of purchase', () => {
    expect(calcRewardValue('VOUCHER', 50_000, 200_000)).toBe(50_000)
    expect(calcRewardValue('VOUCHER', 50_000, 0)).toBe(50_000)
  })

  it('returns fixed points for POINTS', () => {
    expect(calcRewardValue('POINTS', 100, 500_000)).toBe(100)
  })

  it('calculates percentage of purchase for DISCOUNT', () => {
    expect(calcRewardValue('DISCOUNT', 10, 100_000)).toBe(10_000)
    expect(calcRewardValue('DISCOUNT', 25, 200_000)).toBe(50_000)
  })

  it('returns 0 for DISCOUNT when purchaseAmount is 0', () => {
    expect(calcRewardValue('DISCOUNT', 20, 0)).toBe(0)
  })
})

// ── 5. Queue status transitions ───────────────────────────────────────────────

describe('isValidQueueTransition', () => {
  it('allows PENDING → SENT', () => {
    expect(isValidQueueTransition('PENDING', 'SENT')).toBe(true)
  })

  it('allows PENDING → FAILED', () => {
    expect(isValidQueueTransition('PENDING', 'FAILED')).toBe(true)
  })

  it('allows FAILED → PENDING (retry)', () => {
    expect(isValidQueueTransition('FAILED', 'PENDING')).toBe(true)
  })

  it('rejects SENT → anything (terminal)', () => {
    expect(isValidQueueTransition('SENT', 'PENDING')).toBe(false)
    expect(isValidQueueTransition('SENT', 'FAILED')).toBe(false)
  })

  it('rejects FAILED → SENT directly', () => {
    expect(isValidQueueTransition('FAILED', 'SENT')).toBe(false)
  })
})

// ── 6. getUpcomingCustomers ──────────────────────────────────────────────────

describe('getUpcomingCustomers', () => {
  const customers: CustomerBirthday[] = [
    { customerId: 'c1', name: 'Adi',  birthday: '1990-06-25' },  // 10 days
    { customerId: 'c2', name: 'Budi', birthday: '1990-06-17' },  // 2 days
    { customerId: 'c3', name: 'Cici', birthday: '1990-07-20' },  // 35 days — outside 30d window
    { customerId: 'c4', name: 'Desi', birthday: null },
  ]

  it('returns only customers within window, sorted by daysUntil', () => {
    const result = getUpcomingCustomers(customers, 'BIRTHDAY', 30, TODAY)
    expect(result.map(c => c.customerId)).toEqual(['c2', 'c1'])
  })

  it('excludes customers with no date', () => {
    const result = getUpcomingCustomers(customers, 'BIRTHDAY', 30, TODAY)
    expect(result.find(c => c.customerId === 'c4')).toBeUndefined()
  })

  it('attaches correct daysUntil', () => {
    const result = getUpcomingCustomers(customers, 'BIRTHDAY', 30, TODAY)
    expect(result[0].daysUntil).toBe(2)
    expect(result[1].daysUntil).toBe(10)
  })
})

// ── 7. formatTriggerLabel ────────────────────────────────────────────────────

describe('formatTriggerLabel', () => {
  it('formats day-of label when daysBeforeTrigger is 0', () => {
    expect(formatTriggerLabel('BIRTHDAY', 0)).toContain('Pada hari')
  })

  it('formats N days before label', () => {
    const label = formatTriggerLabel('BIRTHDAY', 3)
    expect(label).toContain('3 hari sebelum')
  })

  it('uses correct event name for ANNIVERSARY', () => {
    expect(formatTriggerLabel('ANNIVERSARY', 0)).toContain('anniversary pembelian')
  })

  it('uses correct event name for SIGNUP_ANNIVERSARY', () => {
    expect(formatTriggerLabel('SIGNUP_ANNIVERSARY', 7)).toContain('anniversary pendaftaran')
  })
})
