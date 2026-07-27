import { describe, it, expect } from 'vitest'

// ── Module toggle logic ────────────────────────────────────────────────────────

const ALL_MODULES = ['pos', 'inventory', 'customers', 'discounts', 'reports']

function parseModules(raw: string | null | undefined): string[] {
  if (!raw) return ALL_MODULES
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : ALL_MODULES
  } catch {
    return ALL_MODULES
  }
}

function hasModule(modules: string[], mod: string): boolean {
  return modules.includes(mod)
}

describe('Module parsing', () => {
  it('returns all modules when value is null', () => {
    expect(parseModules(null)).toEqual(ALL_MODULES)
  })
  it('returns all modules when value is undefined', () => {
    expect(parseModules(undefined)).toEqual(ALL_MODULES)
  })
  it('parses valid JSON array', () => {
    expect(parseModules('["pos","inventory"]')).toEqual(['pos', 'inventory'])
  })
  it('falls back to all modules on invalid JSON', () => {
    expect(parseModules('not-json')).toEqual(ALL_MODULES)
  })
  it('falls back when JSON is not an array', () => {
    expect(parseModules('{"pos":true}')).toEqual(ALL_MODULES)
  })
})

describe('Module access checks', () => {
  const fullModules = ['pos', 'inventory', 'customers', 'discounts', 'reports']
  const jasaModules = ['customers', 'discounts', 'reports']

  it('warung/cafe/retail has all modules', () => {
    expect(hasModule(fullModules, 'pos')).toBe(true)
    expect(hasModule(fullModules, 'inventory')).toBe(true)
  })

  it('jasa (service) has no POS or inventory', () => {
    expect(hasModule(jasaModules, 'pos')).toBe(false)
    expect(hasModule(jasaModules, 'inventory')).toBe(false)
    expect(hasModule(jasaModules, 'customers')).toBe(true)
    expect(hasModule(jasaModules, 'reports')).toBe(true)
  })
})

// ── Business type preset coverage ────────────────────────────────────────────

const BUSINESS_TYPE_MODULES: Record<string, string[]> = {
  warung:  ['pos', 'inventory', 'customers', 'discounts', 'reports'],
  cafe:    ['pos', 'inventory', 'customers', 'discounts', 'reports'],
  retail:  ['pos', 'inventory', 'customers', 'discounts', 'reports'],
  jasa:    ['customers', 'discounts', 'reports'],
  online:  ['inventory', 'customers', 'discounts', 'reports'],
  lainnya: ['pos', 'inventory', 'customers', 'discounts', 'reports'],
}

describe('Business type module presets', () => {
  it('all types include reports and discounts', () => {
    Object.values(BUSINESS_TYPE_MODULES).forEach(mods => {
      expect(mods).toContain('reports')
      expect(mods).toContain('discounts')
    })
  })

  it('jasa does not include pos', () => {
    expect(BUSINESS_TYPE_MODULES.jasa).not.toContain('pos')
  })

  it('online does not include pos', () => {
    expect(BUSINESS_TYPE_MODULES.online).not.toContain('pos')
  })

  it('warung and cafe include all modules', () => {
    expect(BUSINESS_TYPE_MODULES.warung).toEqual(ALL_MODULES)
    expect(BUSINESS_TYPE_MODULES.cafe).toEqual(ALL_MODULES)
  })
})

// ── Onboarding step sequence ──────────────────────────────────────────────────

type OnboardingStep = 'business_type' | 'store_info' | 'first_product' | 'done'

const STEP_ORDER: OnboardingStep[] = ['business_type', 'store_info', 'first_product', 'done']

function nextStep(current: OnboardingStep): OnboardingStep | null {
  const idx = STEP_ORDER.indexOf(current)
  if (idx === -1 || idx === STEP_ORDER.length - 1) return null
  return STEP_ORDER[idx + 1]
}

function isLastStep(step: OnboardingStep): boolean {
  return step === 'done'
}

describe('Onboarding step flow', () => {
  it('advances through all steps', () => {
    expect(nextStep('business_type')).toBe('store_info')
    expect(nextStep('store_info')).toBe('first_product')
    expect(nextStep('first_product')).toBe('done')
  })

  it('returns null after last step', () => {
    expect(nextStep('done')).toBeNull()
  })

  it('identifies last step', () => {
    expect(isLastStep('done')).toBe(true)
    expect(isLastStep('business_type')).toBe(false)
    expect(isLastStep('store_info')).toBe(false)
  })
})
