import { describe, it, expect } from 'vitest'
import {
  calcAgeDays,
  classifyAgeBucket,
  calcTurnoverRate,
  isSlowMover,
  calcAgingValue,
  calcAlertLevel,
} from '@/components/inventory/StockAgeClient'

describe('Stock Age Analysis', () => {
  // ── Age calculation ────────────────────────────────────────────────────────

  describe('calcAgeDays', () => {
    it('should calculate days since received correctly', () => {
      const now = new Date('2024-06-30T12:00:00Z')
      const receivedAt = '2024-06-15T00:00:00Z'
      expect(calcAgeDays(receivedAt, now)).toBe(15)
    })

    it('should return 0 for items received today', () => {
      const now = new Date('2024-06-30T12:00:00Z')
      const receivedAt = '2024-06-30T00:00:00Z'
      expect(calcAgeDays(receivedAt, now)).toBe(0)
    })

    it('should return 0 (not negative) for future receivedAt dates', () => {
      const now = new Date('2024-06-30T12:00:00Z')
      const receivedAt = '2024-07-05T00:00:00Z'
      expect(calcAgeDays(receivedAt, now)).toBe(0)
    })
  })

  // ── Age bucket classification ──────────────────────────────────────────────

  describe('classifyAgeBucket', () => {
    it('should classify 0 days as 0-30 bucket', () => {
      expect(classifyAgeBucket(0)).toBe('0-30')
    })

    it('should classify 30 days as 0-30 bucket', () => {
      expect(classifyAgeBucket(30)).toBe('0-30')
    })

    it('should classify 31 days as 31-60 bucket', () => {
      expect(classifyAgeBucket(31)).toBe('31-60')
    })

    it('should classify 60 days as 31-60 bucket', () => {
      expect(classifyAgeBucket(60)).toBe('31-60')
    })

    it('should classify 61 days as 61-90 bucket', () => {
      expect(classifyAgeBucket(61)).toBe('61-90')
    })

    it('should classify 91 days as 90+ bucket', () => {
      expect(classifyAgeBucket(91)).toBe('90+')
    })
  })

  // ── Turnover rate calculation ──────────────────────────────────────────────

  describe('calcTurnoverRate', () => {
    it('should calculate turnover rate correctly', () => {
      // 10 units sold with avg stock of 20 → 0.5
      expect(calcTurnoverRate(10, 20)).toBe(0.5)
    })

    it('should return 0 when avgStock is zero', () => {
      expect(calcTurnoverRate(50, 0)).toBe(0)
    })

    it('should return 0 when avgStock is negative', () => {
      expect(calcTurnoverRate(10, -5)).toBe(0)
    })
  })

  // ── Slow-mover threshold detection ────────────────────────────────────────

  describe('isSlowMover', () => {
    it('should flag turnover below default threshold (0.5) as slow', () => {
      expect(isSlowMover(0.3)).toBe(true)
    })

    it('should not flag turnover at or above threshold as slow', () => {
      expect(isSlowMover(0.5)).toBe(false)
      expect(isSlowMover(1.2)).toBe(false)
    })

    it('should respect a custom threshold', () => {
      expect(isSlowMover(0.8, 1.0)).toBe(true)
      expect(isSlowMover(1.5, 1.0)).toBe(false)
    })
  })

  // ── Aging value aggregation ────────────────────────────────────────────────

  describe('calcAgingValue', () => {
    it('should compute aging value as qty × cost', () => {
      expect(calcAgingValue(50, 20000)).toBe(1000000)
    })

    it('should return 0 when qty is 0', () => {
      expect(calcAgingValue(0, 50000)).toBe(0)
    })
  })

  // ── Alert level ────────────────────────────────────────────────────────────

  describe('calcAlertLevel', () => {
    it('should return HIGH for zero turnover and age > 90 days', () => {
      expect(calcAlertLevel(0, 95)).toBe('HIGH')
    })

    it('should return HIGH when turnover is below 0.2', () => {
      expect(calcAlertLevel(0.1, 45)).toBe('HIGH')
    })

    it('should return MEDIUM when turnover is below 0.5 or age > 60 days', () => {
      expect(calcAlertLevel(0.4, 30)).toBe('MEDIUM')
    })

    it('should return LOW for acceptable turnover and fresh stock', () => {
      expect(calcAlertLevel(0.6, 20)).toBe('LOW')
    })
  })
})
