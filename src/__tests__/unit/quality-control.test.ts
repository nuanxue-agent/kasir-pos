import { describe, it, expect } from 'vitest'

// ─── Types ────────────────────────────────────────────────────────────────────

type QCStatus = 'PENDING' | 'PASSED' | 'FAILED' | 'PARTIAL'
type CheckpointResult = 'PASS' | 'FAIL' | 'NA'

// ─── Pure functions (mirrors of QualityControlClient exports) ─────────────────

function calcPassRate(passQty: number, totalQty: number): number {
  if (totalQty <= 0) return 0
  return Math.round((passQty / totalQty) * 100)
}

function calcFailRate(failQty: number, totalQty: number): number {
  if (totalQty <= 0) return 0
  return Math.round((failQty / totalQty) * 100)
}

function calcDefectRate(failQty: number, passQty: number): number {
  const total = passQty + failQty
  if (total <= 0) return 0
  return Math.round((failQty / total) * 100)
}

function deriveInspectionStatus(passQty: number, failQty: number): QCStatus {
  if (passQty === 0 && failQty === 0) return 'PENDING'
  if (failQty === 0 && passQty > 0) return 'PASSED'
  if (passQty === 0 && failQty > 0) return 'FAILED'
  return 'PARTIAL'
}

function calcCheckpointScore(checkpoints: Array<{ result: CheckpointResult }>): number {
  const applicable = checkpoints.filter(c => c.result !== 'NA')
  if (applicable.length === 0) return 100
  const passed = applicable.filter(c => c.result === 'PASS').length
  return Math.round((passed / applicable.length) * 100)
}

function isPartialPass(passQty: number, failQty: number): boolean {
  return passQty > 0 && failQty > 0
}

function validateInspection(data: {
  productId: string
  inspectedBy: string
  passQty: number
  failQty: number
}): string | null {
  if (!data.productId) return 'productId diperlukan'
  if (!data.inspectedBy.trim()) return 'inspectedBy diperlukan'
  if (data.passQty < 0) return 'passQty tidak boleh negatif'
  if (data.failQty < 0) return 'failQty tidak boleh negatif'
  if (data.passQty === 0 && data.failQty === 0) return 'passQty atau failQty harus > 0'
  return null
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('calcPassRate', () => {
  it('returns 100 when all pass', () => {
    expect(calcPassRate(10, 10)).toBe(100)
  })

  it('returns 0 when totalQty is 0', () => {
    expect(calcPassRate(0, 0)).toBe(0)
  })

  it('returns 75 for 3 pass out of 4', () => {
    expect(calcPassRate(3, 4)).toBe(75)
  })
})

describe('calcFailRate', () => {
  it('returns 0 when no failures', () => {
    expect(calcFailRate(0, 10)).toBe(0)
  })

  it('returns 25 for 1 fail out of 4', () => {
    expect(calcFailRate(1, 4)).toBe(25)
  })
})

describe('deriveInspectionStatus', () => {
  it('returns PENDING when both zero', () => {
    expect(deriveInspectionStatus(0, 0)).toBe('PENDING')
  })

  it('returns PASSED when only pass qty', () => {
    expect(deriveInspectionStatus(10, 0)).toBe('PASSED')
  })

  it('returns FAILED when only fail qty', () => {
    expect(deriveInspectionStatus(0, 5)).toBe('FAILED')
  })

  it('returns PARTIAL when both pass and fail present', () => {
    expect(deriveInspectionStatus(8, 2)).toBe('PARTIAL')
  })
})

describe('calcCheckpointScore', () => {
  it('returns 100 when no checkpoints', () => {
    expect(calcCheckpointScore([])).toBe(100)
  })

  it('returns 100 when all NA', () => {
    expect(calcCheckpointScore([{ result: 'NA' }, { result: 'NA' }])).toBe(100)
  })

  it('scores only applicable checkpoints', () => {
    const cps = [
      { result: 'PASS' as CheckpointResult },
      { result: 'PASS' as CheckpointResult },
      { result: 'FAIL' as CheckpointResult },
      { result: 'NA'   as CheckpointResult },
    ]
    expect(calcCheckpointScore(cps)).toBe(67)
  })
})

describe('calcDefectRate', () => {
  it('returns 0 when no defects', () => {
    expect(calcDefectRate(0, 10)).toBe(0)
  })

  it('returns 100 when all fail', () => {
    expect(calcDefectRate(10, 0)).toBe(100)
  })

  it('returns 20 for 1 fail out of 5', () => {
    expect(calcDefectRate(1, 4)).toBe(20)
  })

  it('returns 0 when total is zero', () => {
    expect(calcDefectRate(0, 0)).toBe(0)
  })
})

describe('isPartialPass', () => {
  it('returns true when both pass and fail present', () => {
    expect(isPartialPass(5, 2)).toBe(true)
  })

  it('returns false when only pass', () => {
    expect(isPartialPass(5, 0)).toBe(false)
  })

  it('returns false when only fail', () => {
    expect(isPartialPass(0, 3)).toBe(false)
  })
})

describe('validateInspection', () => {
  it('returns null for valid input', () => {
    expect(validateInspection({ productId: 'p1', inspectedBy: 'Ali', passQty: 5, failQty: 0 })).toBeNull()
  })

  it('rejects missing productId', () => {
    expect(validateInspection({ productId: '', inspectedBy: 'Ali', passQty: 5, failQty: 0 })).toBeTruthy()
  })

  it('rejects zero qty for both pass and fail', () => {
    expect(validateInspection({ productId: 'p1', inspectedBy: 'Ali', passQty: 0, failQty: 0 })).toBeTruthy()
  })
})
