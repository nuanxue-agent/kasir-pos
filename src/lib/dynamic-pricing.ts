/**
 * @module dynamic-pricing
 * Pure logic for dynamic pricing rule evaluation — no DB, no side-effects.
 * Imported by API routes and unit tests.
 */

export type RuleType = 'TIME_BASED' | 'STOCK_BASED' | 'DEMAND_BASED' | 'COMPETITOR'

export type ConditionOperator = 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ'

export interface RuleCondition {
  field: string      // e.g. 'hour', 'stock', 'demand_score', 'competitor_price'
  operator: ConditionOperator
  value: number
}

export type ActionType = 'INCREASE' | 'DECREASE' | 'SET'
export type ActionUnit = 'PERCENT' | 'FIXED'

export interface RuleAction {
  type: ActionType
  value: number
  unit: ActionUnit
}

export interface PricingRule {
  id: string
  storeId: string
  name: string
  type: RuleType
  condition: RuleCondition
  action: RuleAction
  priority: number
  active: boolean
  validFrom: string | null
  validTo: string | null
}

// ── Condition evaluation ──────────────────────────────────────────────────────

export function evaluateOperator(actual: number, operator: ConditionOperator, threshold: number): boolean {
  switch (operator) {
    case 'GT':  return actual > threshold
    case 'GTE': return actual >= threshold
    case 'LT':  return actual < threshold
    case 'LTE': return actual <= threshold
    case 'EQ':  return actual === threshold
    default:    return false
  }
}

/**
 * Evaluate a rule condition against the provided context values.
 * @param condition  The rule condition.
 * @param context    Map of field name → current value (e.g. { hour: 19, stock: 5 }).
 */
export function evaluateCondition(condition: RuleCondition, context: Record<string, number>): boolean {
  const actual = context[condition.field]
  if (actual === undefined) return false
  return evaluateOperator(actual, condition.operator, condition.value)
}

// ── Validity date check ───────────────────────────────────────────────────────

export function isRuleValid(rule: Pick<PricingRule, 'validFrom' | 'validTo'>, now = new Date()): boolean {
  const ts = now.getTime()
  if (rule.validFrom && new Date(rule.validFrom).getTime() > ts) return false
  if (rule.validTo   && new Date(rule.validTo).getTime()   < ts) return false
  return true
}

// ── Price adjustment calculation ─────────────────────────────────────────────

/**
 * Apply a single action to the given price.
 */
export function applyAction(price: number, action: RuleAction): number {
  switch (action.type) {
    case 'SET':
      return Math.max(0, action.unit === 'FIXED' ? action.value : price * (action.value / 100))

    case 'INCREASE':
      return action.unit === 'PERCENT'
        ? Math.round(price * (1 + action.value / 100))
        : Math.round(price + action.value)

    case 'DECREASE':
      return action.unit === 'PERCENT'
        ? Math.max(0, Math.round(price * (1 - action.value / 100)))
        : Math.max(0, Math.round(price - action.value))

    default:
      return price
  }
}

// ── Rule evaluation result ────────────────────────────────────────────────────

export interface EvalResult {
  ruleId: string
  ruleName: string
  oldPrice: number
  newPrice: number
  reason: string
}

/**
 * Evaluate a single rule against context.
 * Returns null when the rule does not apply.
 */
export function evaluateRule(
  rule: PricingRule,
  currentPrice: number,
  context: Record<string, number>,
  now = new Date(),
): EvalResult | null {
  if (!rule.active) return null
  if (!isRuleValid(rule, now)) return null
  if (!evaluateCondition(rule.condition, context)) return null

  const newPrice = applyAction(currentPrice, rule.action)
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    oldPrice: currentPrice,
    newPrice,
    reason: `Rule "${rule.name}" (${rule.type}): ${rule.condition.field} ${rule.condition.operator} ${rule.condition.value} → ${rule.action.type} ${rule.action.value}${rule.action.unit === 'PERCENT' ? '%' : ''}`,
  }
}

// ── Multiple rule application (priority-ordered) ─────────────────────────────

/**
 * Apply all matching rules in priority order (highest priority first).
 * Each rule operates on the price output of the previous matching rule.
 * Returns final price and all applied results.
 */
export function applyRules(
  rules: PricingRule[],
  basePrice: number,
  context: Record<string, number>,
  now = new Date(),
): { finalPrice: number; applied: EvalResult[] } {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority)
  let price = basePrice
  const applied: EvalResult[] = []

  for (const rule of sorted) {
    const result = evaluateRule(rule, price, context, now)
    if (result) {
      price = result.newPrice
      applied.push(result)
    }
  }

  return { finalPrice: price, applied }
}

// ── Context builder helpers ───────────────────────────────────────────────────

export function buildContext(params: {
  stock?: number
  hour?: number
  demandScore?: number
  competitorPrice?: number
}): Record<string, number> {
  const ctx: Record<string, number> = {}
  if (params.stock         !== undefined) ctx['stock']            = params.stock
  if (params.hour          !== undefined) ctx['hour']             = params.hour
  if (params.demandScore   !== undefined) ctx['demand_score']     = params.demandScore
  if (params.competitorPrice !== undefined) ctx['competitor_price'] = params.competitorPrice
  return ctx
}
