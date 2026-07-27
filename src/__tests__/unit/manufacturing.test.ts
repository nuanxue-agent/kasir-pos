import { describe, it, expect } from 'vitest'

// ── BOM Validation helpers ─────────────────────────────────────────────────────
function validateBOM(bom: { name?: string; outputQty?: number; unit?: string }) {
  if (!bom.name || bom.name.trim().length < 2) return { ok: false, error: 'Nama minimal 2 karakter' }
  if (bom.outputQty === undefined || bom.outputQty <= 0) return { ok: false, error: 'outputQty harus > 0' }
  if (!bom.unit || bom.unit.trim() === '') return { ok: false, error: 'unit harus diisi' }
  return { ok: true, error: null }
}

function validateBOMComponent(comp: { bomId?: string; productId?: string; qty?: number }) {
  if (!comp.bomId) return { ok: false, error: 'bomId required' }
  if (!comp.productId) return { ok: false, error: 'productId required' }
  if (!comp.qty || comp.qty <= 0) return { ok: false, error: 'qty harus > 0' }
  return { ok: true, error: null }
}

// ── Work Order Status Machine ─────────────────────────────────────────────────
type WOStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

const VALID_TRANSITIONS: Record<WOStatus, WOStatus[]> = {
  DRAFT:       ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED:   [],
  CANCELLED:   [],
}

function canTransition(from: WOStatus, to: WOStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

function applyTransition(wo: { status: WOStatus; actualStart?: string; completedAt?: string }, to: WOStatus, now: string) {
  if (!canTransition(wo.status, to)) throw new Error(`Invalid transition: ${wo.status} → ${to}`)
  const updated = { ...wo, status: to }
  if (to === 'IN_PROGRESS') updated.actualStart = now
  if (to === 'COMPLETED')   updated.completedAt = now
  return updated
}

// ── Material Consumption helpers ──────────────────────────────────────────────
function calcRequiredMaterials(components: { productId: string; qty: number }[], plannedQty: number) {
  return components.map(c => ({ productId: c.productId, requiredQty: c.qty * plannedQty, consumedQty: 0 }))
}

function calcRemainingMaterial(required: number, consumed: number): number {
  return Math.max(0, required - consumed)
}

function consumeMaterial(
  materials: { productId: string; requiredQty: number; consumedQty: number }[],
  productId: string,
  qty: number,
) {
  return materials.map(m => {
    if (m.productId !== productId) return m
    const newConsumed = m.consumedQty + qty
    if (newConsumed > m.requiredQty) throw new Error('Konsumsi melebihi kebutuhan')
    return { ...m, consumedQty: newConsumed }
  })
}

function isMaterialFullyConsumed(materials: { requiredQty: number; consumedQty: number }[]): boolean {
  return materials.every(m => m.consumedQty >= m.requiredQty)
}

function calcYield(producedQty: number, plannedQty: number): number {
  if (plannedQty <= 0) return 0
  return (producedQty / plannedQty) * 100
}

function generateWONumber(storePrefix: string, seq: number): string {
  return `WO-${storePrefix}-${String(seq).padStart(4, '0')}`
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('BOM Validation', () => {
  it('rejects name shorter than 2 chars', () => {
    expect(validateBOM({ name: 'A', outputQty: 1, unit: 'pcs' })).toMatchObject({ ok: false })
  })

  it('rejects empty name', () => {
    expect(validateBOM({ name: '', outputQty: 1, unit: 'pcs' })).toMatchObject({ ok: false })
  })

  it('rejects zero outputQty', () => {
    expect(validateBOM({ name: 'Brownies', outputQty: 0, unit: 'pcs' })).toMatchObject({ ok: false })
  })

  it('rejects negative outputQty', () => {
    expect(validateBOM({ name: 'Brownies', outputQty: -1, unit: 'pcs' })).toMatchObject({ ok: false })
  })

  it('rejects missing unit', () => {
    expect(validateBOM({ name: 'Brownies', outputQty: 1, unit: '' })).toMatchObject({ ok: false })
  })

  it('accepts valid BOM', () => {
    expect(validateBOM({ name: 'Brownies Coklat', outputQty: 12, unit: 'pcs' })).toMatchObject({ ok: true })
  })

  it('accepts fractional outputQty', () => {
    expect(validateBOM({ name: 'Adonan Roti', outputQty: 0.5, unit: 'kg' })).toMatchObject({ ok: true })
  })
})

describe('BOM Component Validation', () => {
  it('rejects missing bomId', () => {
    expect(validateBOMComponent({ productId: 'p1', qty: 2 })).toMatchObject({ ok: false })
  })

  it('rejects missing productId', () => {
    expect(validateBOMComponent({ bomId: 'b1', qty: 2 })).toMatchObject({ ok: false })
  })

  it('rejects zero qty', () => {
    expect(validateBOMComponent({ bomId: 'b1', productId: 'p1', qty: 0 })).toMatchObject({ ok: false })
  })

  it('accepts valid component', () => {
    expect(validateBOMComponent({ bomId: 'b1', productId: 'p1', qty: 3 })).toMatchObject({ ok: true })
  })
})

describe('Work Order Status Machine', () => {
  it('DRAFT can transition to IN_PROGRESS', () => {
    expect(canTransition('DRAFT', 'IN_PROGRESS')).toBe(true)
  })

  it('DRAFT can be CANCELLED', () => {
    expect(canTransition('DRAFT', 'CANCELLED')).toBe(true)
  })

  it('DRAFT cannot go directly to COMPLETED', () => {
    expect(canTransition('DRAFT', 'COMPLETED')).toBe(false)
  })

  it('IN_PROGRESS can transition to COMPLETED', () => {
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true)
  })

  it('IN_PROGRESS can be CANCELLED', () => {
    expect(canTransition('IN_PROGRESS', 'CANCELLED')).toBe(true)
  })

  it('COMPLETED has no valid transitions', () => {
    expect(canTransition('COMPLETED', 'DRAFT')).toBe(false)
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false)
  })

  it('CANCELLED has no valid transitions', () => {
    expect(canTransition('CANCELLED', 'DRAFT')).toBe(false)
    expect(canTransition('CANCELLED', 'IN_PROGRESS')).toBe(false)
  })

  it('applyTransition sets actualStart when starting', () => {
    const wo = { status: 'DRAFT' as WOStatus }
    const result = applyTransition(wo, 'IN_PROGRESS', '2026-01-01T10:00:00Z')
    expect(result.actualStart).toBe('2026-01-01T10:00:00Z')
    expect(result.status).toBe('IN_PROGRESS')
  })

  it('applyTransition sets completedAt when completing', () => {
    const wo = { status: 'IN_PROGRESS' as WOStatus, actualStart: '2026-01-01T10:00:00Z' }
    const result = applyTransition(wo, 'COMPLETED', '2026-01-02T12:00:00Z')
    expect(result.completedAt).toBe('2026-01-02T12:00:00Z')
    expect(result.status).toBe('COMPLETED')
  })

  it('applyTransition throws on invalid transition', () => {
    const wo = { status: 'COMPLETED' as WOStatus }
    expect(() => applyTransition(wo, 'DRAFT', '2026-01-01T00:00:00Z')).toThrow()
  })
})

describe('Material Consumption', () => {
  it('calcRequiredMaterials scales by plannedQty', () => {
    const comps = [{ productId: 'flour', qty: 2 }, { productId: 'sugar', qty: 0.5 }]
    const result = calcRequiredMaterials(comps, 3)
    expect(result[0].requiredQty).toBe(6)
    expect(result[1].requiredQty).toBe(1.5)
  })

  it('calcRequiredMaterials starts with zero consumedQty', () => {
    const result = calcRequiredMaterials([{ productId: 'x', qty: 1 }], 5)
    expect(result[0].consumedQty).toBe(0)
  })

  it('calcRemainingMaterial returns correct remainder', () => {
    expect(calcRemainingMaterial(10, 4)).toBe(6)
  })

  it('calcRemainingMaterial floors at 0', () => {
    expect(calcRemainingMaterial(5, 10)).toBe(0)
  })

  it('consumeMaterial accumulates correctly', () => {
    const mats = [{ productId: 'flour', requiredQty: 10, consumedQty: 0 }]
    const after = consumeMaterial(mats, 'flour', 4)
    expect(after[0].consumedQty).toBe(4)
  })

  it('consumeMaterial throws when exceeding required', () => {
    const mats = [{ productId: 'flour', requiredQty: 10, consumedQty: 8 }]
    expect(() => consumeMaterial(mats, 'flour', 5)).toThrow('Konsumsi melebihi kebutuhan')
  })

  it('isMaterialFullyConsumed returns true when all consumed', () => {
    const mats = [
      { requiredQty: 5, consumedQty: 5 },
      { requiredQty: 3, consumedQty: 3 },
    ]
    expect(isMaterialFullyConsumed(mats)).toBe(true)
  })

  it('isMaterialFullyConsumed returns false when partially consumed', () => {
    const mats = [
      { requiredQty: 5, consumedQty: 5 },
      { requiredQty: 3, consumedQty: 1 },
    ]
    expect(isMaterialFullyConsumed(mats)).toBe(false)
  })

  it('calcYield returns correct percentage', () => {
    expect(calcYield(9, 10)).toBeCloseTo(90)
  })

  it('calcYield handles zero plannedQty gracefully', () => {
    expect(calcYield(5, 0)).toBe(0)
  })
})

describe('Work Order Number Generation', () => {
  it('generates zero-padded WO number', () => {
    expect(generateWONumber('STR', 1)).toBe('WO-STR-0001')
  })

  it('generates correct number for seq > 9999', () => {
    expect(generateWONumber('X', 10000)).toBe('WO-X-10000')
  })
})
