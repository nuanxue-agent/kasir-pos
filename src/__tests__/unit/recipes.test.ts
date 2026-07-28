import { describe, it, expect } from 'vitest'

// ── Recipe / BOM — pure business logic ────────────────────────────────────────

interface RecipeIngredient {
  ingredientProductId: string
  qty: number
  unit: string
  cost?: number   // cost per unit of ingredient
  stock?: number  // available stock
  trackStock?: boolean
  name?: string
}

interface Recipe {
  id: string
  storeId: string
  productId: string
  name: string
  yieldQty: number
  notes?: string
  ingredients: RecipeIngredient[]
}

interface CostResult {
  totalCost: number
  costPerUnit: number
  yieldQty: number
}

interface AvailabilityResult {
  canProduce: boolean
  batches: number
  shortfalls: Array<{
    productId: string
    name: string
    required: number
    available: number
  }>
}

// ── Business logic functions ──────────────────────────────────────────────────

function calcRecipeCost(recipe: Recipe): CostResult {
  const totalCost = recipe.ingredients.reduce(
    (sum, ing) => sum + ing.qty * (ing.cost ?? 0),
    0,
  )
  const costPerUnit = recipe.yieldQty > 0 ? totalCost / recipe.yieldQty : 0
  return { totalCost, costPerUnit, yieldQty: recipe.yieldQty }
}

function checkAvailability(recipe: Recipe, batches: number): AvailabilityResult {
  const shortfalls: AvailabilityResult['shortfalls'] = []
  for (const ing of recipe.ingredients) {
    if (!ing.trackStock) continue
    const required = ing.qty * batches
    const available = ing.stock ?? 0
    if (available < required) {
      shortfalls.push({
        productId: ing.ingredientProductId,
        name: ing.name ?? ing.ingredientProductId,
        required,
        available,
      })
    }
  }
  return { canProduce: shortfalls.length === 0, batches, shortfalls }
}

function maxBatchesPossible(recipe: Recipe): number {
  let maxBatches = Infinity
  for (const ing of recipe.ingredients) {
    if (!ing.trackStock) continue
    const available = ing.stock ?? 0
    if (ing.qty <= 0) continue
    const possible = Math.floor(available / ing.qty)
    if (possible < maxBatches) maxBatches = possible
  }
  return maxBatches === Infinity ? 0 : maxBatches
}

function validateIngredients(ingredients: RecipeIngredient[]): string | null {
  if (ingredients.length === 0) return 'At least one ingredient required'
  for (const ing of ingredients) {
    if (!ing.ingredientProductId) return 'Ingredient must have a product ID'
    if (ing.qty <= 0) return 'Ingredient qty must be positive'
    if (!ing.unit) return 'Ingredient must have a unit'
  }
  return null
}

function calcProductionCostPerBatch(recipe: Recipe, batches: number): number {
  return calcRecipeCost(recipe).totalCost * batches
}

function unitConversionFactor(from: string, to: string): number {
  const grams: Record<string, number> = { g: 1, kg: 1000 }
  const ml: Record<string, number> = { ml: 1, L: 1000 }
  if (grams[from] && grams[to]) return grams[from] / grams[to]
  if (ml[from] && ml[to]) return ml[from] / ml[to]
  if (from === to) return 1
  throw new Error(`Cannot convert ${from} to ${to}`)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const baseRecipe: Recipe = {
  id: 'r1',
  storeId: 's1',
  productId: 'p1',
  name: 'Kopi Susu',
  yieldQty: 10,
  ingredients: [
    { ingredientProductId: 'ing1', qty: 100, unit: 'g', cost: 0.05, stock: 500, trackStock: true, name: 'Kopi Bubuk' },
    { ingredientProductId: 'ing2', qty: 200, unit: 'ml', cost: 0.01, stock: 2000, trackStock: true, name: 'Susu' },
    { ingredientProductId: 'ing3', qty: 50, unit: 'g', cost: 0.02, stock: 300, trackStock: false, name: 'Gula' },
  ],
}

describe('Recipe — calcRecipeCost', () => {
  it('calculates total ingredient cost', () => {
    const result = calcRecipeCost(baseRecipe)
    // 100*0.05 + 200*0.01 + 50*0.02 = 5 + 2 + 1 = 8
    expect(result.totalCost).toBeCloseTo(8)
  })

  it('calculates cost per unit based on yield', () => {
    const result = calcRecipeCost(baseRecipe)
    expect(result.costPerUnit).toBeCloseTo(0.8)
  })

  it('returns 0 cost per unit when yieldQty is 0', () => {
    const recipe = { ...baseRecipe, yieldQty: 0 }
    expect(calcRecipeCost(recipe).costPerUnit).toBe(0)
  })

  it('handles recipe with no ingredients', () => {
    const recipe = { ...baseRecipe, ingredients: [] }
    expect(calcRecipeCost(recipe).totalCost).toBe(0)
  })
})

describe('Recipe — checkAvailability', () => {
  it('returns canProduce=true when all stock sufficient', () => {
    const result = checkAvailability(baseRecipe, 2)
    // needs 200g kopi (have 500), 400ml susu (have 2000)
    expect(result.canProduce).toBe(true)
    expect(result.shortfalls).toHaveLength(0)
  })

  it('returns shortfall when stock is insufficient', () => {
    const recipe: Recipe = {
      ...baseRecipe,
      ingredients: [
        { ingredientProductId: 'ing1', qty: 300, unit: 'g', stock: 500, trackStock: true, name: 'Kopi' },
      ],
    }
    // 2 batches need 600g, have 500 → shortfall
    const result = checkAvailability(recipe, 2)
    expect(result.canProduce).toBe(false)
    expect(result.shortfalls).toHaveLength(1)
    expect(result.shortfalls[0].required).toBe(600)
    expect(result.shortfalls[0].available).toBe(500)
  })

  it('ignores ingredients with trackStock=false', () => {
    const recipe: Recipe = {
      ...baseRecipe,
      ingredients: [
        { ingredientProductId: 'ing3', qty: 9999, unit: 'g', stock: 0, trackStock: false, name: 'Gula' },
      ],
    }
    expect(checkAvailability(recipe, 1).canProduce).toBe(true)
  })
})

describe('Recipe — maxBatchesPossible', () => {
  it('returns max batches limited by most constrained ingredient', () => {
    // ing1: 500/100 = 5 batches, ing2: 2000/200 = 10 batches → min = 5
    expect(maxBatchesPossible(baseRecipe)).toBe(5)
  })

  it('returns 0 when no tracked ingredients have stock', () => {
    const recipe: Recipe = {
      ...baseRecipe,
      ingredients: [
        { ingredientProductId: 'ing1', qty: 100, unit: 'g', stock: 0, trackStock: true },
      ],
    }
    expect(maxBatchesPossible(recipe)).toBe(0)
  })
})

describe('Recipe — validation', () => {
  it('rejects empty ingredients list', () => {
    expect(validateIngredients([])).toContain('least one ingredient')
  })

  it('rejects ingredient without product ID', () => {
    expect(validateIngredients([{ ingredientProductId: '', qty: 1, unit: 'g' }])).not.toBeNull()
  })

  it('rejects ingredient with zero qty', () => {
    expect(validateIngredients([{ ingredientProductId: 'p1', qty: 0, unit: 'g' }])).not.toBeNull()
  })

  it('accepts valid ingredients', () => {
    expect(validateIngredients([{ ingredientProductId: 'p1', qty: 100, unit: 'g' }])).toBeNull()
  })
})

describe('Recipe — helpers', () => {
  it('calculates production cost for N batches', () => {
    expect(calcProductionCostPerBatch(baseRecipe, 3)).toBeCloseTo(24)
  })

  it('converts kg to g', () => {
    expect(unitConversionFactor('kg', 'g')).toBe(1000)
  })

  it('converts L to ml', () => {
    expect(unitConversionFactor('L', 'ml')).toBe(1000)
  })

  it('same unit returns factor 1', () => {
    expect(unitConversionFactor('g', 'g')).toBe(1)
  })
})
