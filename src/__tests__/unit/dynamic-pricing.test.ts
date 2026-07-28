import { describe, it, expect } from 'vitest'
import {
  evaluateCondition,
  evaluateOperator,
  applyAction,
  evaluateRule,
  applyRules,
  isRuleValid,
  type PricingRule,
  type RuleCondition,
  type RuleAction,
} from '@/lib/dynamic-pricing'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRule(overrides: Partial<PricingRule> = {}): PricingRule {
  return {
    id: 'r1',
    storeId: 's1',
    name: 'Test Rule',
    type: 'STOCK_BASED',
    condition: { field: 'stock', operator: 'LT', value: 20 },
    action: { type: 'DECREASE', value: 10, unit: 'PERCENT' },
    priority: 10,
    active: true,
    validFrom: null,
    validTo: null,
    ...overrides,
  }
}

// ── 1. Rule condition evaluation — operator matching ──────────────────────────

describe('evaluateOperator', () => {
  it('GT returns true when actual > threshold', () => {
    expect(evaluateOperator(25, 'GT', 20)).toBe(true)
  })

  it('LT returns false when actual >= threshold', () => {
    expect(evaluateOperator(20, 'LT', 20)).toBe(false)
  })

  it('LTE returns true when actual equals threshold', () => {
    expect(evaluateOperator(20, 'LTE', 20)).toBe(true)
  })

  it('EQ returns false when values differ', () => {
    expect(evaluateOperator(19, 'EQ', 20)).toBe(false)
  })
})

// ── 2. evaluateCondition resolves field from context ─────────────────────────

describe('evaluateCondition', () => {
  it('returns false when field is missing from context', () => {
    const cond: RuleCondition = { field: 'stock', operator: 'LT', value: 10 }
    expect(evaluateCondition(cond, {})).toBe(false)
  })

  it('returns true when context satisfies condition', () => {
    const cond: RuleCondition = { field: 'hour', operator: 'GTE', value: 18 }
    expect(evaluateCondition(cond, { hour: 19 })).toBe(true)
  })
})

// ── 3. Price adjustment calculation — percent ─────────────────────────────────

describe('applyAction — PERCENT', () => {
  it('DECREASE by 10% from 100000 gives 90000', () => {
    const action: RuleAction = { type: 'DECREASE', value: 10, unit: 'PERCENT' }
    expect(applyAction(100_000, action)).toBe(90_000)
  })

  it('INCREASE by 20% from 50000 gives 60000', () => {
    const action: RuleAction = { type: 'INCREASE', value: 20, unit: 'PERCENT' }
    expect(applyAction(50_000, action)).toBe(60_000)
  })

  it('DECREASE clamps to 0 on over-discount', () => {
    const action: RuleAction = { type: 'DECREASE', value: 150, unit: 'PERCENT' }
    expect(applyAction(10_000, action)).toBe(0)
  })
})

// ── 4. Price adjustment calculation — fixed ───────────────────────────────────

describe('applyAction — FIXED', () => {
  it('DECREASE by fixed 5000 from 20000 gives 15000', () => {
    const action: RuleAction = { type: 'DECREASE', value: 5_000, unit: 'FIXED' }
    expect(applyAction(20_000, action)).toBe(15_000)
  })

  it('SET to fixed value ignores base price', () => {
    const action: RuleAction = { type: 'SET', value: 25_000, unit: 'FIXED' }
    expect(applyAction(99_999, action)).toBe(25_000)
  })
})

// ── 5. Priority ordering ──────────────────────────────────────────────────────

describe('applyRules — priority ordering', () => {
  it('applies higher-priority rule first', () => {
    const rules: PricingRule[] = [
      makeRule({ id: 'low',  priority: 1,  action: { type: 'INCREASE', value: 10, unit: 'PERCENT' } }),
      makeRule({ id: 'high', priority: 100, action: { type: 'DECREASE', value: 50, unit: 'PERCENT' } }),
    ]
    // high priority DECREASE runs first on 100000 → 50000, then low priority INCREASE → 55000
    const { finalPrice, applied } = applyRules(rules, 100_000, { stock: 5 })
    expect(applied[0].ruleId).toBe('high')
    expect(finalPrice).toBe(55_000)
  })
})

// ── 6. Validity date check ────────────────────────────────────────────────────

describe('isRuleValid', () => {
  it('returns false when validFrom is in the future', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(isRuleValid({ validFrom: future, validTo: null })).toBe(false)
  })

  it('returns false when validTo is in the past', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    expect(isRuleValid({ validFrom: null, validTo: past })).toBe(false)
  })

  it('returns true when both validFrom and validTo are null', () => {
    expect(isRuleValid({ validFrom: null, validTo: null })).toBe(true)
  })
})

// ── 7. Multiple rule application ──────────────────────────────────────────────

describe('applyRules — multiple rules', () => {
  it('skips inactive rules', () => {
    const rules: PricingRule[] = [
      makeRule({ id: 'active', active: true,  action: { type: 'DECREASE', value: 10, unit: 'PERCENT' } }),
      makeRule({ id: 'off',   active: false, action: { type: 'DECREASE', value: 50, unit: 'PERCENT' } }),
    ]
    const { finalPrice, applied } = applyRules(rules, 100_000, { stock: 5 })
    expect(applied).toHaveLength(1)
    expect(applied[0].ruleId).toBe('active')
    expect(finalPrice).toBe(90_000)
  })

  it('returns base price when no rules match', () => {
    const rules: PricingRule[] = [
      makeRule({ condition: { field: 'stock', operator: 'GT', value: 1000 } }),
    ]
    const { finalPrice, applied } = applyRules(rules, 50_000, { stock: 5 })
    expect(applied).toHaveLength(0)
    expect(finalPrice).toBe(50_000)
  })
})
