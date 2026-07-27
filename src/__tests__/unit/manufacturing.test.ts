import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BOMComponent {
  productId: string
  qty: number // qty per unit of finished product
  unit: string
}

interface BOM {
  id: string
  outputProductId: string
  outputQty: number
  components: BOMComponent[]
}

interface WorkOrder {
  id: string
  number: string
  bomId: string
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  plannedQty: number
  producedQty: number
  plannedStart?: string | null
  completedAt?: string | null
}

interface WorkOrderMaterial {
  productId: string
  requiredQty: number
  consumedQty: number
}

interface Product {
  id: string
  name: string
  stock: number
  cost: number
}

// ── Pure business-logic helpers ───────────────────────────────────────────────

/** Total required qty of a component for a given production run */
function calcComponentRequired(component: BOMComponent, plannedQty: number): number {
  return component.qty * plannedQty
}

/** Build work order materials list from BOM + planned qty */
function buildWorkOrderMaterials(bom: BOM, plannedQty: number): WorkOrderMaterial[] {
  return bom.components.map(c => ({
    productId: c.productId,
    requiredQty: calcComponentRequired(c, plannedQty),
    consumedQty: 0,
  }))
}

/** Total material cost for a work order */
function calcMaterialCost(materials: WorkOrderMaterial[], products: Product[]): number {
  return materials.reduce((sum, mat) => {
    const prod = products.find(p => p.id === mat.productId)
    return sum + (prod?.cost ?? 0) * mat.requiredQty
  }, 0)
}

/** Reserve (decrement) stock for each material on production start */
function reserveMaterials(
  products: Product[],
  materials: WorkOrderMaterial[],
): { ok: boolean; products?: Product[]; error?: string } {
  // Check all stock is sufficient first
  for (const mat of materials) {
    const prod = products.find(p => p.id === mat.productId)
    if (!prod) return { ok: false, error: `Product ${mat.productId} not found` }
    if (prod.stock < mat.requiredQty) {
      return {
        ok: false,
        error: `Insufficient stock for ${prod.name}: need ${mat.requiredQty}, have ${prod.stock}`,
      }
    }
  }
  const updated = products.map(p => {
    const mat = materials.find(m => m.productId === p.id)
    return mat ? { ...p, stock: p.stock - mat.requiredQty } : p
  })
  return { ok: true, products: updated }
}

/** Increment finished product stock on completion */
function completeProduction(
  products: Product[],
  outputProductId: string,
  producedQty: number,
): Product[] {
  return products.map(p => (p.id === outputProductId ? { ...p, stock: p.stock + producedQty } : p))
}

/** Validate status transition */
function isValidTransition(from: WorkOrder['status'], to: WorkOrder['status']): boolean {
  const transitions: Record<WorkOrder['status'], WorkOrder['status'][]> = {
    DRAFT: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  }
  return transitions[from]?.includes(to) ?? false
}

/** Partial completion: only produced a fraction of planned */
function calcPartialCompletion(
  plannedQty: number,
  producedQty: number,
): { efficiency: number; shortfall: number } {
  const efficiency = plannedQty > 0 ? producedQty / plannedQty : 0
  const shortfall = Math.max(0, plannedQty - producedQty)
  return { efficiency, shortfall }
}

// ── Test data ─────────────────────────────────────────────────────────────────

const flour: Product = { id: 'flour', name: 'Flour', stock: 100, cost: 5_000 }
const sugar: Product = { id: 'sugar', name: 'Sugar', stock: 50, cost: 8_000 }
const butter: Product = { id: 'butter', name: 'Butter', stock: 20, cost: 15_000 }
const cake: Product = { id: 'cake', name: 'Cake', stock: 0, cost: 0 }

const cakeBOM: BOM = {
  id: 'bom-1',
  outputProductId: 'cake',
  outputQty: 1,
  components: [
    { productId: 'flour', qty: 2, unit: 'kg' },
    { productId: 'sugar', qty: 0.5, unit: 'kg' },
    { productId: 'butter', qty: 0.25, unit: 'kg' },
  ],
}

const baseWO: WorkOrder = {
  id: 'wo-1',
  number: 'WO-TEST-0001',
  bomId: 'bom-1',
  status: 'DRAFT',
  plannedQty: 4,
  producedQty: 0,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BOM component quantity calculation', () => {
  it('calculates required qty for a single component', () => {
    const comp: BOMComponent = { productId: 'flour', qty: 2, unit: 'kg' }
    expect(calcComponentRequired(comp, 4)).toBe(8)
  })

  it('builds full work order materials list from BOM and planned qty', () => {
    const mats = buildWorkOrderMaterials(cakeBOM, 4)
    expect(mats).toHaveLength(3)
    expect(mats.find(m => m.productId === 'flour')?.requiredQty).toBe(8)
    expect(mats.find(m => m.productId === 'sugar')?.requiredQty).toBe(2)
    expect(mats.find(m => m.productId === 'butter')?.requiredQty).toBe(1)
  })

  it('returns zero required qty when planned qty is 0', () => {
    const mats = buildWorkOrderMaterials(cakeBOM, 0)
    expect(mats.every(m => m.requiredQty === 0)).toBe(true)
  })
})

describe('Work order material cost', () => {
  it('calculates total material cost correctly', () => {
    const mats = buildWorkOrderMaterials(cakeBOM, 4)
    const products = [flour, sugar, butter, cake]
    // flour: 8 * 5000 = 40000 ; sugar: 2 * 8000 = 16000 ; butter: 1 * 15000 = 15000
    expect(calcMaterialCost(mats, products)).toBe(71_000)
  })

  it('treats missing product cost as zero', () => {
    const mats: WorkOrderMaterial[] = [{ productId: 'unknown', requiredQty: 5, consumedQty: 0 }]
    expect(calcMaterialCost(mats, [flour])).toBe(0)
  })
})

describe('Stock reservation on production start', () => {
  it('decrements component stock correctly', () => {
    const mats = buildWorkOrderMaterials(cakeBOM, 4)
    const { ok, products: updated } = reserveMaterials([flour, sugar, butter, cake], mats)
    expect(ok).toBe(true)
    expect(updated!.find(p => p.id === 'flour')!.stock).toBe(92) // 100 - 8
    expect(updated!.find(p => p.id === 'sugar')!.stock).toBe(48) // 50 - 2
    expect(updated!.find(p => p.id === 'butter')!.stock).toBe(19) // 20 - 1
  })

  it('fails reservation when stock is insufficient', () => {
    const lowStock = { ...flour, stock: 3 } // needs 8
    const mats = buildWorkOrderMaterials(cakeBOM, 4)
    const { ok, error } = reserveMaterials([lowStock, sugar, butter], mats)
    expect(ok).toBe(false)
    expect(error).toContain('Insufficient stock')
  })
})

describe('Stock increment on completion', () => {
  it('increments finished product stock after completion', () => {
    const products = [flour, sugar, butter, { ...cake, stock: 2 }]
    const updated = completeProduction(products, 'cake', 4)
    expect(updated.find(p => p.id === 'cake')!.stock).toBe(6) // 2 + 4
  })

  it('does not affect other products when incrementing finished stock', () => {
    const products = [flour, sugar, butter, cake]
    const updated = completeProduction(products, 'cake', 4)
    expect(updated.find(p => p.id === 'flour')!.stock).toBe(100)
    expect(updated.find(p => p.id === 'sugar')!.stock).toBe(50)
  })
})

describe('Status transition validation', () => {
  it('allows DRAFT → IN_PROGRESS', () => {
    expect(isValidTransition('DRAFT', 'IN_PROGRESS')).toBe(true)
  })

  it('allows IN_PROGRESS → COMPLETED', () => {
    expect(isValidTransition('IN_PROGRESS', 'COMPLETED')).toBe(true)
  })

  it('rejects COMPLETED → IN_PROGRESS', () => {
    expect(isValidTransition('COMPLETED', 'IN_PROGRESS')).toBe(false)
  })
})

describe('Partial completion handling', () => {
  it('calculates efficiency and shortfall for partial run', () => {
    const { efficiency, shortfall } = calcPartialCompletion(10, 7)
    expect(efficiency).toBeCloseTo(0.7)
    expect(shortfall).toBe(3)
  })

  it('reports 100% efficiency when fully produced', () => {
    const { efficiency, shortfall } = calcPartialCompletion(4, 4)
    expect(efficiency).toBe(1)
    expect(shortfall).toBe(0)
  })

  it('handles zero plannedQty without division error', () => {
    const { efficiency, shortfall } = calcPartialCompletion(0, 0)
    expect(efficiency).toBe(0)
    expect(shortfall).toBe(0)
  })
})
