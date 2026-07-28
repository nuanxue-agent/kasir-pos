import { describe, it, expect } from 'vitest'
import {
  detectSaleStatus,
  isSaleActive,
  calcDiscountPct,
  applyDiscountPct,
  calcStockRemaining,
  calcStockUsedPct,
  hasStock,
  validateSale,
  countdownSecondsRemaining,
  formatCountdown,
} from '@/lib/flash-sales'

// ── Sale Status Detection ──────────────────────────────────────────────────────

describe('Flash Sales — Status Detection', () => {
  const base = new Date('2025-01-01T10:00:00Z').getTime()

  it('returns SCHEDULED when current time is before startAt', () => {
    const start = new Date('2025-01-01T11:00:00Z').toISOString()
    const end   = new Date('2025-01-01T12:00:00Z').toISOString()
    expect(detectSaleStatus(start, end, base)).toBe('SCHEDULED')
  })

  it('returns ACTIVE when current time is within window', () => {
    const start = new Date('2025-01-01T09:00:00Z').toISOString()
    const end   = new Date('2025-01-01T11:00:00Z').toISOString()
    expect(detectSaleStatus(start, end, base)).toBe('ACTIVE')
  })

  it('returns ENDED when current time is after endAt', () => {
    const start = new Date('2025-01-01T07:00:00Z').toISOString()
    const end   = new Date('2025-01-01T09:00:00Z').toISOString()
    expect(detectSaleStatus(start, end, base)).toBe('ENDED')
  })

  it('returns ENDED for invalid date strings', () => {
    expect(detectSaleStatus('not-a-date', 'also-not', base)).toBe('ENDED')
  })
})

// ── isSaleActive ──────────────────────────────────────────────────────────────

describe('Flash Sales — isSaleActive', () => {
  const now = new Date('2025-06-01T12:00:00Z').getTime()

  it('returns true for ACTIVE status within window', () => {
    const sale = {
      status: 'ACTIVE' as const,
      startAt: new Date('2025-06-01T11:00:00Z').toISOString(),
      endAt:   new Date('2025-06-01T13:00:00Z').toISOString(),
    }
    expect(isSaleActive(sale, now)).toBe(true)
  })

  it('returns false for CANCELLED sale even if window is open', () => {
    const sale = {
      status: 'CANCELLED' as const,
      startAt: new Date('2025-06-01T11:00:00Z').toISOString(),
      endAt:   new Date('2025-06-01T13:00:00Z').toISOString(),
    }
    expect(isSaleActive(sale, now)).toBe(false)
  })
})

// ── Discount Percentage ───────────────────────────────────────────────────────

describe('Flash Sales — Discount Percentage', () => {
  it('calculates 50% discount correctly', () => {
    expect(calcDiscountPct(100_000, 50_000)).toBe(50)
  })

  it('returns 0 when sale price equals original price', () => {
    expect(calcDiscountPct(80_000, 80_000)).toBe(0)
  })

  it('returns 0 when original price is zero', () => {
    expect(calcDiscountPct(0, 0)).toBe(0)
  })

  it('applies discount percentage back to original price', () => {
    const original = 200_000
    const pct = calcDiscountPct(original, 150_000)   // 25%
    expect(applyDiscountPct(original, pct)).toBe(150_000)
  })

  it('applyDiscountPct clamps to 0 at 100% discount', () => {
    expect(applyDiscountPct(100_000, 100)).toBe(0)
  })
})

// ── Stock Remaining ───────────────────────────────────────────────────────────

describe('Flash Sales — Stock Remaining', () => {
  it('calculates remaining stock correctly', () => {
    expect(calcStockRemaining(100, 30)).toBe(70)
  })

  it('clamps to 0 when sold exceeds limit', () => {
    expect(calcStockRemaining(50, 60)).toBe(0)
  })

  it('calculates stock used percentage correctly', () => {
    expect(calcStockUsedPct(100, 75)).toBe(75)
  })

  it('hasStock returns false for inactive item', () => {
    expect(hasStock({ stockLimit: 100, soldQty: 0, active: false })).toBe(false)
  })

  it('hasStock returns true when stock limit is 0 (unlimited)', () => {
    expect(hasStock({ stockLimit: 0, soldQty: 999, active: true })).toBe(true)
  })
})

// ── Sale Validity ─────────────────────────────────────────────────────────────

describe('Flash Sales — Validity Check', () => {
  it('rejects sale with empty name', () => {
    const r = validateSale('', '2025-01-01T10:00:00Z', '2025-01-01T11:00:00Z')
    expect(r.valid).toBe(false)
    expect(r.reason).toMatch(/name/)
  })

  it('rejects sale where endAt is before startAt', () => {
    const r = validateSale('Flash', '2025-01-01T12:00:00Z', '2025-01-01T10:00:00Z')
    expect(r.valid).toBe(false)
    expect(r.reason).toMatch(/endAt/)
  })

  it('accepts a valid sale definition', () => {
    const r = validateSale('Big Flash', '2025-01-01T10:00:00Z', '2025-01-01T12:00:00Z')
    expect(r.valid).toBe(true)
  })
})

// ── Countdown Seconds Remaining ───────────────────────────────────────────────

describe('Flash Sales — Countdown', () => {
  it('returns correct seconds remaining', () => {
    const endAt = new Date(Date.now() + 3600_000).toISOString()  // 1 hour from now
    const secs  = countdownSecondsRemaining(endAt)
    expect(secs).toBeGreaterThan(3590)
    expect(secs).toBeLessThanOrEqual(3600)
  })

  it('returns 0 when sale already ended', () => {
    const endAt = new Date(Date.now() - 5000).toISOString()
    expect(countdownSecondsRemaining(endAt)).toBe(0)
  })

  it('formats countdown as HH:MM:SS', () => {
    expect(formatCountdown(3661)).toBe('01:01:01')
  })

  it('formats 0 seconds as 00:00:00', () => {
    expect(formatCountdown(0)).toBe('00:00:00')
  })
})
