import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type RuleType = 'TIME_BASED' | 'DEMAND_BASED' | 'STOCK_BASED' | 'SURGE'
type AdjustmentType = 'PERCENTAGE' | 'FIXED'

interface PricingRule {
  id: string
  storeId: string
  name: string
  ruleType: RuleType
  conditions: any
  adjustment: AdjustmentType
  value: number
  priority: number
  active: boolean
}

interface Product {
  id: string
  name: string
  price: number
  stock?: number
}

// ── Business Logic ─────────────────────────────────────────────────────────────

function applyAdjustment(price: number, adjustment: AdjustmentType, value: number): number {
  if (adjustment === 'PERCENTAGE') {
    return Math.round(price * (1 + value / 100))
  }
  return Math.max(0, price + value)
}

function evaluateRule(rule: PricingRule, product: Product, now = new Date()): { applies: boolean; effectivePrice: number } {
  if (!rule.active) return { applies: false, effectivePrice: product.price }

  const cond = rule.conditions || {}
  let applies = false

  if (rule.ruleType === 'TIME_BASED') {
    const hour = now.getHours()
    const startHour = cond.startHour ?? 0
    const endHour = cond.endHour ?? 24
    applies = hour >= startHour && hour < endHour
  } else if (rule.ruleType === 'STOCK_BASED') {
    const stock = product.stock ?? 0
    const threshold = cond.threshold ?? 0
    const operator = cond.operator || 'GT'
    applies = operator === 'GT' ? stock > threshold : stock < threshold
  } else if (rule.ruleType === 'DEMAND_BASED' || rule.ruleType === 'SURGE') {
    applies = true
  }

  const effectivePrice = applies ? applyAdjustment(product.price, rule.adjustment, rule.value) : product.price
  return { applies, effectivePrice }
}

function calcEffectivePrice(product: Product, rules: PricingRule[], now = new Date()): number {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority)
  let runningProduct = { ...product }

  for (const rule of sorted) {
    const { applies, effectivePrice } = evaluateRule(rule, runningProduct, now)
    if (applies) {
      runningProduct = { ...runningProduct, price: effectivePrice }
    }
  }

  return runningProduct.price
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Dynamic Pricing', () => {
  const product: Product = {
    id: 'p1',
    name: 'Coffee',
    price: 5000,
    stock: 15,
  }

  describe('Time-based rules', () => {
    it('should apply discount during happy hour', () => {
      const rule: PricingRule = {
        id: 'r1',
        storeId: 's1',
        name: 'Happy Hour',
        ruleType: 'TIME_BASED',
        conditions: { startHour: 17, endHour: 19 },
        adjustment: 'PERCENTAGE',
        value: -20,
        priority: 10,
        active: true,
      }

      const now18 = new Date('2024-01-01T18:00:00')
      const result = evaluateRule(rule, product, now18)
      expect(result.applies).toBe(true)
      expect(result.effectivePrice).toBe(4000) // 5000 * 0.8
    })

    it('should not apply outside happy hour', () => {
      const rule: PricingRule = {
        id: 'r1',
        storeId: 's1',
        name: 'Happy Hour',
        ruleType: 'TIME_BASED',
        conditions: { startHour: 17, endHour: 19 },
        adjustment: 'PERCENTAGE',
        value: -20,
        priority: 10,
        active: true,
      }

      const now14 = new Date('2024-01-01T14:00:00')
      const result = evaluateRule(rule, product, now14)
      expect(result.applies).toBe(false)
      expect(result.effectivePrice).toBe(5000)
    })

    it('should apply peak hour surcharge', () => {
      const rule: PricingRule = {
        id: 'r2',
        storeId: 's1',
        name: 'Peak Hour',
        ruleType: 'TIME_BASED',
        conditions: { startHour: 12, endHour: 14 },
        adjustment: 'PERCENTAGE',
        value: 15,
        priority: 10,
        active: true,
      }

      const now13 = new Date('2024-01-01T13:00:00')
      const result = evaluateRule(rule, product, now13)
      expect(result.applies).toBe(true)
      expect(result.effectivePrice).toBe(5750) // 5000 * 1.15
    })
  })

  describe('Stock-based rules', () => {
    it('should apply discount when stock is high', () => {
      const rule: PricingRule = {
        id: 'r3',
        storeId: 's1',
        name: 'Overstock Discount',
        ruleType: 'STOCK_BASED',
        conditions: { threshold: 10, operator: 'GT' },
        adjustment: 'PERCENTAGE',
        value: -10,
        priority: 10,
        active: true,
      }

      const result = evaluateRule(rule, product)
      expect(result.applies).toBe(true) // stock 15 > 10
      expect(result.effectivePrice).toBe(4500) // 5000 * 0.9
    })

    it('should increase price when stock is low', () => {
      const lowStockProduct = { ...product, stock: 3 }
      const rule: PricingRule = {
        id: 'r4',
        storeId: 's1',
        name: 'Low Stock Premium',
        ruleType: 'STOCK_BASED',
        conditions: { threshold: 5, operator: 'LT' },
        adjustment: 'PERCENTAGE',
        value: 25,
        priority: 10,
        active: true,
      }

      const result = evaluateRule(rule, lowStockProduct)
      expect(result.applies).toBe(true) // stock 3 < 5
      expect(result.effectivePrice).toBe(6250) // 5000 * 1.25
    })

    it('should not apply when stock threshold not met', () => {
      const rule: PricingRule = {
        id: 'r5',
        storeId: 's1',
        name: 'Low Stock Premium',
        ruleType: 'STOCK_BASED',
        conditions: { threshold: 5, operator: 'LT' },
        adjustment: 'PERCENTAGE',
        value: 25,
        priority: 10,
        active: true,
      }

      const result = evaluateRule(rule, product) // stock 15 >= 5
      expect(result.applies).toBe(false)
      expect(result.effectivePrice).toBe(5000)
    })
  })

  describe('Adjustment types', () => {
    it('should apply percentage adjustment correctly', () => {
      const rule: PricingRule = {
        id: 'r6',
        storeId: 's1',
        name: 'Percentage Discount',
        ruleType: 'SURGE',
        conditions: {},
        adjustment: 'PERCENTAGE',
        value: -30,
        priority: 10,
        active: true,
      }

      const result = evaluateRule(rule, product)
      expect(result.effectivePrice).toBe(3500) // 5000 * 0.7
    })

    it('should apply fixed adjustment correctly', () => {
      const rule: PricingRule = {
        id: 'r7',
        storeId: 's1',
        name: 'Fixed Discount',
        ruleType: 'SURGE',
        conditions: {},
        adjustment: 'FIXED',
        value: -1000,
        priority: 10,
        active: true,
      }

      const result = evaluateRule(rule, product)
      expect(result.effectivePrice).toBe(4000) // 5000 - 1000
    })

    it('should not allow negative prices with fixed adjustment', () => {
      const rule: PricingRule = {
        id: 'r8',
        storeId: 's1',
        name: 'Large Discount',
        ruleType: 'SURGE',
        conditions: {},
        adjustment: 'FIXED',
        value: -6000,
        priority: 10,
        active: true,
      }

      const result = evaluateRule(rule, product)
      expect(result.effectivePrice).toBe(0)
    })
  })

  describe('Rule priority', () => {
    it('should apply higher priority rule first', () => {
      const rules: PricingRule[] = [
        {
          id: 'r9',
          storeId: 's1',
          name: 'Low Priority',
          ruleType: 'SURGE',
          conditions: {},
          adjustment: 'PERCENTAGE',
          value: -10,
          priority: 5,
          active: true,
        },
        {
          id: 'r10',
          storeId: 's1',
          name: 'High Priority',
          ruleType: 'SURGE',
          conditions: {},
          adjustment: 'PERCENTAGE',
          value: -20,
          priority: 20,
          active: true,
        },
      ]

      const effectivePrice = calcEffectivePrice(product, rules)
      // Descending sort: r10(-20%, p20) first → 4000, then r9(-10%, p5) chains → 3600
      expect(effectivePrice).toBe(3600)
    })

    it('should stack multiple applicable rules', () => {
      const rules: PricingRule[] = [
        {
          id: 'r11',
          storeId: 's1',
          name: 'Base Discount',
          ruleType: 'SURGE',
          conditions: {},
          adjustment: 'PERCENTAGE',
          value: -10,
          priority: 10,
          active: true,
        },
        {
          id: 'r12',
          storeId: 's1',
          name: 'Additional Discount',
          ruleType: 'SURGE',
          conditions: {},
          adjustment: 'FIXED',
          value: -500,
          priority: 5,
          active: true,
        },
      ]

      const effectivePrice = calcEffectivePrice(product, rules)
      // Descending priority: r11(10, -10%) first: 5000 * 0.9 = 4500
      // Then r12(5, -500 fixed): 4500 - 500 = 4000
      expect(effectivePrice).toBe(4000)
    })
  })

  describe('Rule activation', () => {
    it('should not apply inactive rule', () => {
      const rule: PricingRule = {
        id: 'r13',
        storeId: 's1',
        name: 'Inactive Discount',
        ruleType: 'SURGE',
        conditions: {},
        adjustment: 'PERCENTAGE',
        value: -50,
        priority: 10,
        active: false,
      }

      const result = evaluateRule(rule, product)
      expect(result.applies).toBe(false)
      expect(result.effectivePrice).toBe(5000)
    })
  })
})
