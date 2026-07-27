/**
 * Mobile navigation unit tests
 *
 * Tests bottom nav tab active-state logic, swipe gesture detection,
 * safe-area inset calculation, and touch target size validation.
 */

import { describe, it, expect } from 'vitest'

// ─── Re-usable pure logic (mirrors what BottomNav / DashboardShell use) ───────

const SWIPE_THRESHOLD = 60
const EDGE_ZONE = 40
const MIN_TOUCH_TARGET_PX = 44 // WCAG 2.5.5 AAA / Apple HIG minimum

/**
 * Determine whether a nav href should be considered "active" for the given pathname.
 * Mirrors the isActive() function used in BottomNav.
 */
function isActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  if (href === '/dashboard/quick-sale') {
    return pathname === '/dashboard/quick-sale' || pathname.startsWith('/dashboard/pos')
  }
  return pathname.startsWith(href)
}

/**
 * Interpret a horizontal swipe event and return the intended action.
 * Returns 'open' | 'close' | 'none'.
 */
function interpretSwipe(
  deltaX: number,
  deltaY: number,
  startX: number,
  sidebarOpen: boolean,
): 'open' | 'close' | 'none' {
  // Mostly vertical → ignore
  if (Math.abs(deltaY) > Math.abs(deltaX)) return 'none'
  if (deltaX > SWIPE_THRESHOLD && startX <= EDGE_ZONE && !sidebarOpen) return 'open'
  if (deltaX < -SWIPE_THRESHOLD && sidebarOpen) return 'close'
  return 'none'
}

/**
 * Calculate effective bottom padding accounting for safe-area inset.
 * Simulates what env(safe-area-inset-bottom, 0px) provides at runtime.
 */
function calcSafeAreaBottom(envValue: number): number {
  return Math.max(0, envValue)
}

/**
 * Validate that a touch target meets the minimum size requirement.
 */
function isTouchTargetValid(widthPx: number, heightPx: number): boolean {
  return widthPx >= MIN_TOUCH_TARGET_PX && heightPx >= MIN_TOUCH_TARGET_PX
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BottomNav — tab active state logic', () => {
  it('marks /dashboard active only for exact match', () => {
    expect(isActive('/dashboard', '/dashboard')).toBe(true)
    expect(isActive('/dashboard', '/dashboard/reports')).toBe(false)
  })

  it('marks /dashboard/reports active for any sub-path', () => {
    expect(isActive('/dashboard/reports', '/dashboard/reports')).toBe(true)
    expect(isActive('/dashboard/reports', '/dashboard/reports/sales')).toBe(true)
  })

  it('marks /dashboard/inventory active for sub-paths', () => {
    expect(isActive('/dashboard/inventory', '/dashboard/inventory/adjust')).toBe(true)
    expect(isActive('/dashboard/inventory', '/dashboard/orders')).toBe(false)
  })

  it('marks POS tab active when on /dashboard/pos route (quick-sale link)', () => {
    expect(isActive('/dashboard/quick-sale', '/dashboard/pos')).toBe(true)
    expect(isActive('/dashboard/quick-sale', '/dashboard/pos/checkout')).toBe(true)
  })

  it('marks quick-sale tab active on its own route', () => {
    expect(isActive('/dashboard/quick-sale', '/dashboard/quick-sale')).toBe(true)
  })

  it('does not mark unrelated tab as active', () => {
    expect(isActive('/dashboard/reports', '/dashboard/inventory')).toBe(false)
    expect(isActive('/dashboard/inventory', '/dashboard/reports')).toBe(false)
  })
})

describe('Swipe gesture detection', () => {
  it('detects right swipe from edge as "open" when sidebar is closed', () => {
    expect(interpretSwipe(80, 5, 20, false)).toBe('open')
  })

  it('ignores right swipe from non-edge zone when sidebar is closed', () => {
    expect(interpretSwipe(80, 5, 60, false)).toBe('none')
  })

  it('detects left swipe as "close" when sidebar is open', () => {
    expect(interpretSwipe(-80, 5, 100, true)).toBe('close')
  })

  it('ignores swipe below deltaX threshold', () => {
    expect(interpretSwipe(30, 5, 20, false)).toBe('none')
    expect(interpretSwipe(-30, 5, 100, true)).toBe('none')
  })

  it('ignores mostly-vertical swipes (scroll conflict prevention)', () => {
    expect(interpretSwipe(80, 120, 20, false)).toBe('none')
  })
})

describe('Safe area inset calculation', () => {
  it('returns 0 for devices without safe area inset', () => {
    expect(calcSafeAreaBottom(0)).toBe(0)
  })

  it('returns positive value for iPhone notch devices', () => {
    expect(calcSafeAreaBottom(34)).toBe(34)
  })

  it('never returns negative padding', () => {
    expect(calcSafeAreaBottom(-5)).toBe(0)
  })
})

describe('Touch target size validation', () => {
  it('accepts targets meeting 44×44 minimum', () => {
    expect(isTouchTargetValid(44, 44)).toBe(true)
    expect(isTouchTargetValid(64, 64)).toBe(true)
  })

  it('rejects targets below 44px in either dimension', () => {
    expect(isTouchTargetValid(43, 44)).toBe(false)
    expect(isTouchTargetValid(44, 43)).toBe(false)
    expect(isTouchTargetValid(32, 32)).toBe(false)
  })

  it('bottom nav bar at 64px height passes validation', () => {
    // Nav bar is h-16 = 64px; each tab takes full height
    expect(isTouchTargetValid(64, 64)).toBe(true)
  })
})
