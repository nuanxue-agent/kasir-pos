import { describe, it, expect } from 'vitest'
import {
  validateRequired,
  validatePositive,
  validateDate,
  ValidationError,
} from '@/app/api/[...path]/route'

// ─── validateRequired ─────────────────────────────────────────────────────────

describe('validateRequired', () => {
  it('passes when all fields are present', () => {
    expect(() => validateRequired({ name: 'Kopi', price: 10000 }, ['name', 'price'])).not.toThrow()
  })

  it('throws ValidationError when a field is missing', () => {
    expect(() => validateRequired({ name: 'Kopi' }, ['name', 'price'])).toThrow(ValidationError)
  })

  it('throws with code MISSING_FIELD', () => {
    try {
      validateRequired({ name: 'Kopi' }, ['name', 'price'])
    } catch (e: any) {
      expect(e.code).toBe('MISSING_FIELD')
    }
  })

  it('throws when field is null', () => {
    expect(() => validateRequired({ name: null }, ['name'])).toThrow(ValidationError)
  })

  it('throws when field is empty string', () => {
    expect(() => validateRequired({ name: '' }, ['name'])).toThrow(ValidationError)
  })

  it('passes for zero numeric value (0 is not missing)', () => {
    // 0 is a valid value — only undefined/null/'' are missing
    expect(() => validateRequired({ stock: 0 }, ['stock'])).not.toThrow()
  })
})

// ─── validatePositive ─────────────────────────────────────────────────────────

describe('validatePositive', () => {
  it('passes for positive integer', () => {
    expect(() => validatePositive(100, 'price')).not.toThrow()
  })

  it('passes for positive float', () => {
    expect(() => validatePositive(0.01, 'price')).not.toThrow()
  })

  it('throws for zero', () => {
    expect(() => validatePositive(0, 'price')).toThrow(ValidationError)
  })

  it('throws for negative value', () => {
    expect(() => validatePositive(-1, 'price')).toThrow(ValidationError)
  })

  it('throws with code INVALID_VALUE', () => {
    try {
      validatePositive(-5, 'qty')
    } catch (e: any) {
      expect(e.code).toBe('INVALID_VALUE')
    }
  })

  it('throws for NaN', () => {
    expect(() => validatePositive(NaN, 'price')).toThrow(ValidationError)
  })

  it('throws for string "abc"', () => {
    expect(() => validatePositive('abc', 'price')).toThrow(ValidationError)
  })
})

// ─── validateDate ─────────────────────────────────────────────────────────────

describe('validateDate', () => {
  it('passes for a valid ISO date', () => {
    expect(() => validateDate('2025-01-15', 'startDate')).not.toThrow()
  })

  it('passes for a valid ISO datetime', () => {
    expect(() => validateDate('2025-01-15T10:30:00.000Z', 'startDate')).not.toThrow()
  })

  it('throws for an invalid date string', () => {
    expect(() => validateDate('not-a-date', 'startDate')).toThrow(ValidationError)
  })

  it('throws for null', () => {
    expect(() => validateDate(null, 'startDate')).toThrow(ValidationError)
  })

  it('throws with code INVALID_DATE', () => {
    try {
      validateDate('31/12/2025', 'startDate')
    } catch (e: any) {
      expect(e.code).toBe('INVALID_DATE')
    }
  })
})

// ─── Structured error format ──────────────────────────────────────────────────

describe('ValidationError shape', () => {
  it('has error, code, and status properties', () => {
    const e = new ValidationError('test error', 'TEST_CODE', 422)
    expect(e.message).toBe('test error')
    expect(e.code).toBe('TEST_CODE')
    expect(e.status).toBe(422)
  })

  it('defaults status to 400', () => {
    const e = new ValidationError('bad input')
    expect(e.status).toBe(400)
  })

  it('defaults code to VALIDATION_ERROR', () => {
    const e = new ValidationError('bad input')
    expect(e.code).toBe('VALIDATION_ERROR')
  })
})

// ─── Request ID uniqueness ────────────────────────────────────────────────────

describe('Request ID uniqueness', () => {
  it('crypto.randomUUID produces unique IDs across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => crypto.randomUUID()))
    expect(ids.size).toBe(100)
  })

  it('UUID matches RFC-4122 format', () => {
    const id = crypto.randomUUID()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
