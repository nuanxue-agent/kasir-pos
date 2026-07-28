import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductionStatus = 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

interface BOMLine {
  materialId: string
  requiredQty: number
  unitCost?: number
}

interface MaterialUsage {
  materialId: string
  requiredQty: number
  usedQty: number
}

// ── Pure business logic (mirrors ProductionOrderClient exports) ───────────────

function calcBOMRequirements(
  bom: BOMLine[],
  produceQty: number,
): Array<{ materialId: string; requiredQty: number }> {
  return bom.map(line => ({
    materialId: line.materialId,
    requiredQty: line.requiredQty * produceQty,
  }))
}

function isValidStatusTransition(from: ProductionStatus, to: ProductionStatus): boolean {
  const allowed: Record<ProductionStatus, ProductionStatus[]> = {
    DRAFT:       ['SCHEDULED', 'CANCELLED'],
    SCHEDULED:   ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED:   [],
    CANCELLED:   [],
  }
  return allowed[from]?.includes(to) ?? false
}

function detectShortages(
  requirements: Array<{ materialId: string; requiredQty: number }>,
  stock: Record<string, number>,
): Array<{ materialId: string; required: number; available: number; shortage: number }> {
  return requirements
    .filter(r => (stock[r.materialId] ?? 0) < r.requiredQty)
    .map(r => ({
      materialId: r.materialId,
      required: r.requiredQty,
      available: stock[r.materialId] ?? 0,
      shortage: r.requiredQty - (stock[r.materialId] ?? 0),
    }))
}

function calcProductionCost(bom: BOMLine[], produceQty: number): number {
  return bom.reduce((sum, line) => sum + (line.unitCost ?? 0) * line.requiredQty * produceQty, 0)
}

function calcCompletionPct(materials: MaterialUsage[]): number {
  if (materials.length === 0) return 0
  const total = materials.reduce((sum, m) => sum + m.requiredQty, 0)
  if (total === 0) return 0
  const used = materials.reduce((sum, m) => sum + Math.min(m.usedQty, m.requiredQty), 0)
  return Math.round((used / total) * 100)
}

function calcMaxProducible(bom: BOMLine[], stock: Record<string, number>): number {
  if (bom.length === 0) return 0
  return Math.floor(Math.min(...bom.map(line => (stock[line.materialId] ?? 0) / line.requiredQty)))
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const bom: BOMLine[] = [
  { materialId: 'mat-flour',  requiredQty: 2,   unitCost: 5000 },
  { materialId: 'mat-sugar',  requiredQty: 0.5, unitCost: 8000 },
  { materialId: 'mat-butter', requiredQty: 1,   unitCost: 12000 },
]

const stock: Record<string, number> = {
  'mat-flour':  20,
  'mat-sugar':  4,
  'mat-butter': 5,
}

// ── BOM material calculation ──────────────────────────────────────────────────

describe('BOM material calculation', () => {
  it('scales requirements linearly with produce qty', () => {
    const reqs = calcBOMRequirements(bom, 4)
    expect(reqs.find(r => r.materialId === 'mat-flour')?.requiredQty).toBe(8)
    expect(reqs.find(r => r.materialId === 'mat-sugar')?.requiredQty).toBe(2)
    expect(reqs.find(r => r.materialId === 'mat-butter')?.requiredQty).toBe(4)
  })

  it('returns empty array when BOM is empty', () => {
    expect(calcBOMRequirements([], 5)).toEqual([])
  })

  it('returns zero quantities when produceQty is 0', () => {
    const reqs = calcBOMRequirements(bom, 0)
    expect(reqs.every(r => r.requiredQty === 0)).toBe(true)
  })
})

// ── Status transition validation ──────────────────────────────────────────────

describe('Status transition validation', () => {
  it('allows DRAFT → SCHEDULED', () => {
    expect(isValidStatusTransition('DRAFT', 'SCHEDULED')).toBe(true)
  })

  it('allows SCHEDULED → IN_PROGRESS', () => {
    expect(isValidStatusTransition('SCHEDULED', 'IN_PROGRESS')).toBe(true)
  })

  it('allows IN_PROGRESS → COMPLETED', () => {
    expect(isValidStatusTransition('IN_PROGRESS', 'COMPLETED')).toBe(true)
  })

  it('rejects COMPLETED → IN_PROGRESS (terminal state)', () => {
    expect(isValidStatusTransition('COMPLETED', 'IN_PROGRESS')).toBe(false)
  })

  it('allows any non-terminal → CANCELLED', () => {
    expect(isValidStatusTransition('DRAFT', 'CANCELLED')).toBe(true)
    expect(isValidStatusTransition('SCHEDULED', 'CANCELLED')).toBe(true)
    expect(isValidStatusTransition('IN_PROGRESS', 'CANCELLED')).toBe(true)
  })

  it('rejects CANCELLED → DRAFT (cannot un-cancel)', () => {
    expect(isValidStatusTransition('CANCELLED', 'DRAFT')).toBe(false)
  })
})

// ── Material shortage detection ───────────────────────────────────────────────

describe('Material shortage detection', () => {
  it('detects shortage when stock is insufficient', () => {
    // Produce 6 requires 12 flour but only 20 available — no shortage for flour
    // Produce 6 requires 6 butter but only 5 available — shortage
    const reqs = calcBOMRequirements(bom, 6)
    const shortages = detectShortages(reqs, stock)
    expect(shortages.some(s => s.materialId === 'mat-butter')).toBe(true)
  })

  it('returns empty when all materials are sufficient', () => {
    const reqs = calcBOMRequirements(bom, 2)
    const shortages = detectShortages(reqs, stock)
    expect(shortages).toHaveLength(0)
  })

  it('includes correct shortage amount', () => {
    const reqs = [{ materialId: 'mat-butter', requiredQty: 10 }]
    const shortages = detectShortages(reqs, { 'mat-butter': 3 })
    expect(shortages[0].shortage).toBe(7)
    expect(shortages[0].available).toBe(3)
  })
})

// ── Production cost calculation ───────────────────────────────────────────────

describe('Production cost calculation', () => {
  it('calculates total cost correctly for 1 unit', () => {
    // flour: 2*5000 + sugar: 0.5*8000 + butter: 1*12000 = 10000+4000+12000 = 26000
    expect(calcProductionCost(bom, 1)).toBe(26000)
  })

  it('scales cost with produce qty', () => {
    expect(calcProductionCost(bom, 3)).toBe(78000)
  })

  it('treats missing unitCost as 0', () => {
    const bomNoCost: BOMLine[] = [{ materialId: 'mat-x', requiredQty: 5 }]
    expect(calcProductionCost(bomNoCost, 10)).toBe(0)
  })
})

// ── Completion percentage ─────────────────────────────────────────────────────

describe('Completion percentage', () => {
  it('returns 0 for empty materials', () => {
    expect(calcCompletionPct([])).toBe(0)
  })

  it('returns 100 when all materials fully used', () => {
    const mats: MaterialUsage[] = [
      { materialId: 'mat-a', requiredQty: 10, usedQty: 10 },
      { materialId: 'mat-b', requiredQty: 5,  usedQty: 5 },
    ]
    expect(calcCompletionPct(mats)).toBe(100)
  })

  it('returns 50 when half of materials used', () => {
    const mats: MaterialUsage[] = [
      { materialId: 'mat-a', requiredQty: 10, usedQty: 5 },
      { materialId: 'mat-b', requiredQty: 10, usedQty: 5 },
    ]
    expect(calcCompletionPct(mats)).toBe(50)
  })

  it('caps used qty at requiredQty (no over-100%)', () => {
    const mats: MaterialUsage[] = [
      { materialId: 'mat-a', requiredQty: 10, usedQty: 20 },
    ]
    expect(calcCompletionPct(mats)).toBe(100)
  })

  it('calculates max producible from BOM and stock', () => {
    // flour: 20/2=10, sugar: 4/0.5=8, butter: 5/1=5 → min=5
    expect(calcMaxProducible(bom, stock)).toBe(5)
  })
})
