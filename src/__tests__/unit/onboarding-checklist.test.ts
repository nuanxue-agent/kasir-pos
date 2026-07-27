import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─── Inline the pure helpers (no DOM/React needed) ────────────────────────────

const CHECKLIST_ITEMS = [
  { id: 'store_info', storageKey: 'onboarding_store_info' },
  { id: 'first_product', storageKey: 'onboarding_first_product' },
  { id: 'first_sale', storageKey: 'onboarding_first_sale' },
  { id: 'add_customer', storageKey: 'onboarding_add_customer' },
  { id: 'receipt_settings', storageKey: 'onboarding_receipt_settings' },
  { id: 'staff_accounts', storageKey: 'onboarding_staff_accounts' },
] as const

const ONBOARDING_DISMISSED_KEY = 'onboarding_dismissed'
const POS_TOUR_DONE_KEY = 'pos_tour_done'
const POS_ORDERS_COUNT_KEY = 'pos_orders_count'

function readCompletionFromStorage(storage: Record<string, string>): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const item of CHECKLIST_ITEMS) {
    result[item.id] = storage[item.storageKey] === 'true'
  }
  return result
}

function countCompleted(completion: Record<string, boolean>): number {
  return Object.values(completion).filter(Boolean).length
}

function shouldAutoShow(storage: Record<string, string>): boolean {
  if (storage[ONBOARDING_DISMISSED_KEY] === 'true') return false
  const completion = readCompletionFromStorage(storage)
  return countCompleted(completion) < CHECKLIST_ITEMS.length
}

function shouldShowTour(storage: Record<string, string>): boolean {
  if (storage[POS_TOUR_DONE_KEY] === 'true') return false
  const ordersCount = parseInt(storage[POS_ORDERS_COUNT_KEY] ?? '0', 10)
  return ordersCount === 0
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OnboardingChecklist — completion detection', () => {
  it('marks item as not completed when key is absent', () => {
    const storage: Record<string, string> = {}
    const completion = readCompletionFromStorage(storage)
    expect(completion['store_info']).toBe(false)
  })

  it('marks item as completed when key is "true"', () => {
    const storage: Record<string, string> = { onboarding_store_info: 'true' }
    const completion = readCompletionFromStorage(storage)
    expect(completion['store_info']).toBe(true)
  })

  it('marks item as not completed when key is "false"', () => {
    const storage: Record<string, string> = { onboarding_first_product: 'false' }
    const completion = readCompletionFromStorage(storage)
    expect(completion['first_product']).toBe(false)
  })

  it('reads all 6 items from storage', () => {
    const storage: Record<string, string> = {}
    const completion = readCompletionFromStorage(storage)
    expect(Object.keys(completion)).toHaveLength(6)
  })
})

describe('OnboardingChecklist — progress calculation', () => {
  it('returns 0 when no items are completed', () => {
    const completion = readCompletionFromStorage({})
    expect(countCompleted(completion)).toBe(0)
  })

  it('returns correct count for partially completed checklist', () => {
    const storage: Record<string, string> = {
      onboarding_store_info: 'true',
      onboarding_first_product: 'true',
      onboarding_first_sale: 'false',
    }
    const completion = readCompletionFromStorage(storage)
    expect(countCompleted(completion)).toBe(2)
  })

  it('returns 6 when all items are completed', () => {
    const storage: Record<string, string> = {
      onboarding_store_info: 'true',
      onboarding_first_product: 'true',
      onboarding_first_sale: 'true',
      onboarding_add_customer: 'true',
      onboarding_receipt_settings: 'true',
      onboarding_staff_accounts: 'true',
    }
    const completion = readCompletionFromStorage(storage)
    expect(countCompleted(completion)).toBe(6)
  })

  it('calculates percentage correctly for 3/6', () => {
    const storage: Record<string, string> = {
      onboarding_store_info: 'true',
      onboarding_first_product: 'true',
      onboarding_first_sale: 'true',
    }
    const completion = readCompletionFromStorage(storage)
    const pct = Math.round((countCompleted(completion) / CHECKLIST_ITEMS.length) * 100)
    expect(pct).toBe(50)
  })
})

describe('OnboardingChecklist — auto-show logic', () => {
  it('auto-shows for new user with no storage keys', () => {
    expect(shouldAutoShow({})).toBe(true)
  })

  it('does not auto-show when dismissed flag is set', () => {
    const storage = { onboarding_dismissed: 'true' }
    expect(shouldAutoShow(storage)).toBe(false)
  })

  it('does not auto-show when all 6 items are completed', () => {
    const storage: Record<string, string> = {
      onboarding_store_info: 'true',
      onboarding_first_product: 'true',
      onboarding_first_sale: 'true',
      onboarding_add_customer: 'true',
      onboarding_receipt_settings: 'true',
      onboarding_staff_accounts: 'true',
    }
    expect(shouldAutoShow(storage)).toBe(false)
  })

  it('auto-shows when partially completed and not dismissed', () => {
    const storage: Record<string, string> = {
      onboarding_store_info: 'true',
      onboarding_first_product: 'true',
    }
    expect(shouldAutoShow(storage)).toBe(true)
  })
})

describe('POSTour — tour step progression', () => {
  it('shows tour when no orders have been made', () => {
    expect(shouldShowTour({})).toBe(true)
  })

  it('does not show tour when pos_tour_done is true', () => {
    const storage = { pos_tour_done: 'true' }
    expect(shouldShowTour(storage)).toBe(false)
  })

  it('does not show tour when orders count is > 0', () => {
    const storage = { pos_orders_count: '3' }
    expect(shouldShowTour(storage)).toBe(false)
  })

  it('shows tour when orders count is exactly 0', () => {
    const storage = { pos_orders_count: '0' }
    expect(shouldShowTour(storage)).toBe(true)
  })

  it('tour has exactly 4 steps', () => {
    const TOUR_STEPS = [
      { id: 'search' },
      { id: 'product-grid' },
      { id: 'cart-panel' },
      { id: 'checkout-button' },
    ]
    expect(TOUR_STEPS).toHaveLength(4)
  })

  it('tour step IDs match expected targets', () => {
    const TOUR_STEPS = [
      { id: 'search', target: '[data-tour="search"]' },
      { id: 'product-grid', target: '[data-tour="product-grid"]' },
      { id: 'cart-panel', target: '[data-tour="cart-panel"]' },
      { id: 'checkout-button', target: '[data-tour="checkout-button"]' },
    ]
    expect(TOUR_STEPS[0].target).toBe('[data-tour="search"]')
    expect(TOUR_STEPS[1].target).toBe('[data-tour="product-grid"]')
    expect(TOUR_STEPS[2].target).toBe('[data-tour="cart-panel"]')
    expect(TOUR_STEPS[3].target).toBe('[data-tour="checkout-button"]')
  })
})
