// src/lib/kitting.ts
// Pure business logic for product assembly & kitting — no DB, no Next.js deps

export type AssemblyStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'

export interface Kit {
  id: string
  storeId: string
  name: string
  outputProductId: string
  outputQty: number
  instructions: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface KitComponent {
  id: string
  kitId: string
  storeId: string
  componentProductId: string
  requiredQty: number
}

export interface AssemblyJob {
  id: string
  kitId: string
  storeId: string
  targetQty: number
  status: AssemblyStatus
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ComponentWithStock extends KitComponent {
  currentStock: number
  costPerUnit?: number
}

export interface FeasibilityResult {
  feasible: boolean
  targetQty: number
  shortfalls: Array<{
    componentProductId: string
    required: number
    available: number
    shortage: number
  }>
  maxAssemblable: number
}

// ── Feasibility ───────────────────────────────────────────────────────────────

/**
 * Check whether N kits can be assembled given current stock levels.
 * Returns the max assemblable count and any shortfalls.
 */
export function checkFeasibility(
  components: ComponentWithStock[],
  targetQty: number,
): FeasibilityResult {
  if (components.length === 0) {
    return { feasible: targetQty === 0, targetQty, shortfalls: [], maxAssemblable: 0 }
  }

  const shortfalls: FeasibilityResult['shortfalls'] = []
  let maxAssemblable = Infinity

  for (const comp of components) {
    const required = comp.requiredQty * targetQty
    const available = comp.currentStock

    if (available < required) {
      shortfalls.push({
        componentProductId: comp.componentProductId,
        required,
        available,
        shortage: required - available,
      })
    }

    // How many kits can this component support?
    if (comp.requiredQty > 0) {
      const canMake = Math.floor(available / comp.requiredQty)
      if (canMake < maxAssemblable) maxAssemblable = canMake
    }
  }

  if (maxAssemblable === Infinity) maxAssemblable = 0

  return {
    feasible: shortfalls.length === 0,
    targetQty,
    shortfalls,
    maxAssemblable,
  }
}

/**
 * Calculate the total required quantity of each component for N kits.
 */
export function calcComponentRequirements(
  components: KitComponent[],
  targetQty: number,
): Array<{ componentProductId: string; requiredQty: number }> {
  return components.map(c => ({
    componentProductId: c.componentProductId,
    requiredQty: c.requiredQty * targetQty,
  }))
}

/**
 * Calculate the total material cost for assembling N kits.
 * Returns 0 if any component is missing a costPerUnit.
 */
export function calcKitCost(
  components: ComponentWithStock[],
  targetQty: number,
): number {
  return components.reduce((sum, c) => {
    const unitCost = c.costPerUnit ?? 0
    return sum + unitCost * c.requiredQty * targetQty
  }, 0)
}

/**
 * Detect partial assembly: targetQty > 0 but maxAssemblable < targetQty.
 */
export function isPartialAssembly(
  components: ComponentWithStock[],
  targetQty: number,
): boolean {
  if (targetQty <= 0) return false
  const result = checkFeasibility(components, targetQty)
  return !result.feasible && result.maxAssemblable > 0
}

/**
 * Calculate the stock delta to apply when completing an assembly job.
 * Returns: components to deduct (negative) and output product to add (positive).
 */
export function calcAssemblyStockUpdate(
  components: KitComponent[],
  kit: Pick<Kit, 'outputProductId' | 'outputQty'>,
  actualQty: number,
): Array<{ productId: string; delta: number }> {
  const updates: Array<{ productId: string; delta: number }> = []

  // Deduct components
  for (const comp of components) {
    updates.push({
      productId: comp.componentProductId,
      delta: -(comp.requiredQty * actualQty),
    })
  }

  // Add output product
  updates.push({
    productId: kit.outputProductId,
    delta: kit.outputQty * actualQty,
  })

  return updates
}

// ── Status transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<AssemblyStatus, AssemblyStatus[]> = {
  PENDING:     ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED:   [],
}

export function isValidAssemblyTransition(from: AssemblyStatus, to: AssemblyStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
