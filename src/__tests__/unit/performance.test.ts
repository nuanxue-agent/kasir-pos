import { describe, it, expect } from 'vitest'
import { parseResponseTime, formatBytes } from '@/app/(dashboard)/dashboard/settings/performance/page'

// ─── Helpers (inline — mirrors POSPageClient windowing logic) ─────────────────

/**
 * Calculate the visible index range for windowed product grid rendering.
 *
 * @param scrollTop   - Current scroll offset in px
 * @param viewHeight  - Visible height of the scroll container in px
 * @param cardHeight  - Approximate card height in px
 * @param cols        - Number of grid columns
 * @param bufferRows  - Extra rows to render above/below viewport
 */
function calcWindowedRange(
  scrollTop: number,
  viewHeight: number,
  cardHeight: number,
  cols: number,
  bufferRows = 2,
): { start: number; end: number } {
  const startRow = Math.max(0, Math.floor(scrollTop / cardHeight) - bufferRows)
  const endRow = Math.ceil((scrollTop + viewHeight) / cardHeight) + bufferRows
  return { start: startRow * cols, end: endRow * cols }
}

// ─── Vitals threshold helpers ─────────────────────────────────────────────────

function isGoodLCP(valueMs: number): boolean {
  return valueMs < 2500
}

function isGoodCLS(value: number): boolean {
  return value < 0.1
}

function isGoodFCP(valueMs: number): boolean {
  return valueMs < 1800
}

function isGoodTTFB(valueMs: number): boolean {
  return valueMs < 800
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Windowed rendering range calculation', () => {
  it('starts at index 0 when not scrolled', () => {
    const range = calcWindowedRange(0, 600, 200, 4, 2)
    expect(range.start).toBe(0)
  })

  it('includes buffer rows beyond the viewport', () => {
    // viewport shows rows 0-2 (600px / 200px), buffer adds 2 more rows → end row = 5
    const range = calcWindowedRange(0, 600, 200, 4, 2)
    expect(range.end).toBe(5 * 4) // 20
  })

  it('skips items above the fold when scrolled down', () => {
    // scrolled 800px: start row = floor(800/200) - 2 = 2
    const range = calcWindowedRange(800, 600, 200, 4, 2)
    expect(range.start).toBe(2 * 4) // 8
  })

  it('adjusts range with different column counts', () => {
    const range2 = calcWindowedRange(0, 600, 200, 2, 1)
    const range5 = calcWindowedRange(0, 600, 200, 5, 1)
    // end row = ceil(600/200) + 1 = 4
    expect(range2.end).toBe(4 * 2) // 8
    expect(range5.end).toBe(4 * 5) // 20
  })

  it('never returns a negative start index', () => {
    const range = calcWindowedRange(0, 600, 200, 4, 10)
    expect(range.start).toBeGreaterThanOrEqual(0)
  })
})

describe('Response time parsing from headers', () => {
  it('parses a valid numeric string', () => {
    expect(parseResponseTime('142.5')).toBe(142.5)
  })

  it('returns null for null header', () => {
    expect(parseResponseTime(null)).toBeNull()
  })

  it('returns null for undefined header', () => {
    expect(parseResponseTime(undefined)).toBeNull()
  })

  it('returns null for non-numeric string', () => {
    expect(parseResponseTime('fast')).toBeNull()
  })

  it('parses integer-string correctly', () => {
    expect(parseResponseTime('300')).toBe(300)
  })
})

describe('Memory usage formatting', () => {
  it('formats bytes under 1 KB', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })
})

describe('Vitals threshold checks', () => {
  it('LCP < 2500ms is good', () => {
    expect(isGoodLCP(2400)).toBe(true)
    expect(isGoodLCP(2500)).toBe(false)
  })

  it('CLS < 0.1 is good', () => {
    expect(isGoodCLS(0.05)).toBe(true)
    expect(isGoodCLS(0.1)).toBe(false)
  })

  it('FCP < 1800ms is good', () => {
    expect(isGoodFCP(1799)).toBe(true)
    expect(isGoodFCP(1800)).toBe(false)
  })

  it('TTFB < 800ms is good', () => {
    expect(isGoodTTFB(799)).toBe(true)
    expect(isGoodTTFB(800)).toBe(false)
  })
})
