import { describe, it, expect } from 'vitest'
import {
  calcAvailableCredit,
  calcUtilizationPct,
  determineCreditStatus,
  canCharge,
  calcDueDate,
  calcDaysOverdue,
  applyTransaction,
} from '@/lib/credit-limits'

// ── 1. Available credit calculation ──────────────────────────────────────────

describe('calcAvailableCredit', () => {
  it('returns limit minus used when used is less than limit', () => {
    expect(calcAvailableCredit(1_000_000, 400_000)).toBe(600_000)
  })

  it('returns 0 when used equals limit', () => {
    expect(calcAvailableCredit(500_000, 500_000)).toBe(0)
  })

  it('returns 0 when used exceeds limit (over-limit guard)', () => {
    expect(calcAvailableCredit(500_000, 600_000)).toBe(0)
  })
})

// ── 2. Utilization percentage ─────────────────────────────────────────────────

describe('calcUtilizationPct', () => {
  it('returns 0 when no credit used', () => {
    expect(calcUtilizationPct(1_000_000, 0)).toBe(0)
  })

  it('returns 50 at half utilization', () => {
    expect(calcUtilizationPct(1_000_000, 500_000)).toBe(50)
  })

  it('returns 100 when fully utilized', () => {
    expect(calcUtilizationPct(1_000_000, 1_000_000)).toBe(100)
  })

  it('returns 0 for zero credit limit (avoid division by zero)', () => {
    expect(calcUtilizationPct(0, 0)).toBe(0)
  })
})

// ── 3. Credit status determination ───────────────────────────────────────────

describe('determineCreditStatus', () => {
  it('returns GOOD when utilization is below 80%', () => {
    expect(determineCreditStatus(1_000_000, 750_000)).toBe('GOOD')
  })

  it('returns WARNING when utilization is exactly 80%', () => {
    expect(determineCreditStatus(1_000_000, 800_000)).toBe('WARNING')
  })

  it('returns WARNING when utilization is between 80% and 99%', () => {
    expect(determineCreditStatus(1_000_000, 900_000)).toBe('WARNING')
  })

  it('returns FROZEN when utilization is exactly 100%', () => {
    expect(determineCreditStatus(1_000_000, 1_000_000)).toBe('FROZEN')
  })

  it('returns FROZEN when utilization exceeds 100%', () => {
    expect(determineCreditStatus(1_000_000, 1_100_000)).toBe('FROZEN')
  })
})

// ── 4. Credit freeze logic ────────────────────────────────────────────────────

describe('canCharge', () => {
  it('allows charge when utilization is well below limit', () => {
    expect(canCharge(1_000_000, 0, 500_000)).toBe(true)
  })

  it('allows charge that brings balance to exactly the limit', () => {
    expect(canCharge(1_000_000, 500_000, 500_000)).toBe(true)
  })

  it('rejects charge that would exceed the limit', () => {
    expect(canCharge(1_000_000, 500_000, 600_000)).toBe(false)
  })

  it('rejects any charge when already frozen (100% utilization)', () => {
    expect(canCharge(1_000_000, 1_000_000, 1)).toBe(false)
  })
})

// ── 5. Payment terms due date ─────────────────────────────────────────────────

describe('calcDueDate', () => {
  it('adds payment terms days to start date', () => {
    expect(calcDueDate('2025-01-01', 30)).toBe('2025-01-31')
  })

  it('handles month boundaries correctly', () => {
    expect(calcDueDate('2025-01-31', 1)).toBe('2025-02-01')
  })
})

describe('calcDaysOverdue', () => {
  it('returns positive days when past due', () => {
    expect(calcDaysOverdue('2025-01-01', '2025-01-11')).toBe(10)
  })

  it('returns 0 on the due date itself', () => {
    expect(calcDaysOverdue('2025-01-01', '2025-01-01')).toBe(0)
  })

  it('returns negative when not yet due', () => {
    expect(calcDaysOverdue('2025-01-31', '2025-01-01')).toBeLessThan(0)
  })
})

// ── 6. Transaction application ────────────────────────────────────────────────

describe('applyTransaction', () => {
  it('CHARGE increases used credit', () => {
    expect(applyTransaction(200_000, 'CHARGE', 100_000)).toBe(300_000)
  })

  it('PAYMENT decreases used credit', () => {
    expect(applyTransaction(500_000, 'PAYMENT', 200_000)).toBe(300_000)
  })

  it('PAYMENT floors at 0 (no negative balance)', () => {
    expect(applyTransaction(100_000, 'PAYMENT', 200_000)).toBe(0)
  })

  it('ADJUSTMENT with positive amount increases used', () => {
    expect(applyTransaction(100_000, 'ADJUSTMENT', 50_000)).toBe(150_000)
  })

  it('ADJUSTMENT with negative amount decreases used', () => {
    expect(applyTransaction(300_000, 'ADJUSTMENT', -100_000)).toBe(200_000)
  })
})
