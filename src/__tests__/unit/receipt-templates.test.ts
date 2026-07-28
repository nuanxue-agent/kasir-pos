import { describe, it, expect } from 'vitest'
import {
  validateTemplate,
  getActiveTemplate,
  buildDefaultTemplate,
  FONT_SIZE_MAP,
  PAPER_WIDTH_OPTIONS,
  PAPER_WIDTH_MAP,
  TEMPLATE_TYPE_LABELS,
} from '@/components/settings/ReceiptTemplateClient'
import type { ReceiptTemplate, FontSize, PaperWidth, TemplateType } from '@/components/settings/ReceiptTemplateClient'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTpl(overrides: Partial<ReceiptTemplate> = {}): ReceiptTemplate {
  return {
    id: 'tpl-1',
    storeId: 'store-1',
    name: 'Template POS',
    type: 'POS',
    headerText: 'Terima kasih!',
    footerText: 'Sampai jumpa!',
    showLogo: true,
    showTax: true,
    showBarcode: false,
    fontSize: 'MEDIUM',
    paperWidth: '80mm',
    active: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ─── Template validation — required fields ─────────────────────────────────────

describe('validateTemplate — required fields', () => {
  it('returns null for a valid template', () => {
    expect(validateTemplate(makeTpl())).toBeNull()
  })

  it('rejects a missing name', () => {
    const result = validateTemplate(makeTpl({ name: '' }))
    expect(result).toMatch(/name/i)
  })

  it('rejects a whitespace-only name', () => {
    const result = validateTemplate(makeTpl({ name: '   ' }))
    expect(result).toMatch(/name/i)
  })

  it('rejects a missing type', () => {
    const result = validateTemplate(makeTpl({ type: undefined as any }))
    expect(result).toMatch(/type/i)
  })
})

// ─── Paper width options ──────────────────────────────────────────────────────

describe('paper width options', () => {
  it('PAPER_WIDTH_OPTIONS contains exactly 58mm and 80mm', () => {
    expect(PAPER_WIDTH_OPTIONS).toEqual(['58mm', '80mm'])
  })

  it('rejects an invalid paper width', () => {
    const result = validateTemplate(makeTpl({ paperWidth: '100mm' as PaperWidth }))
    expect(result).toMatch(/paperWidth/i)
  })

  it('58mm maps to 32 columns', () => {
    expect(PAPER_WIDTH_MAP['58mm'].cols).toBe(32)
  })

  it('80mm maps to 48 columns', () => {
    expect(PAPER_WIDTH_MAP['80mm'].cols).toBe(48)
  })
})

// ─── Font size mapping ────────────────────────────────────────────────────────

describe('font size mapping', () => {
  it('SMALL maps to 10px', () => {
    expect(FONT_SIZE_MAP['SMALL'].px).toBe(10)
  })

  it('MEDIUM maps to 12px', () => {
    expect(FONT_SIZE_MAP['MEDIUM'].px).toBe(12)
  })

  it('LARGE maps to 14px', () => {
    expect(FONT_SIZE_MAP['LARGE'].px).toBe(14)
  })

  it('rejects an invalid font size', () => {
    const result = validateTemplate(makeTpl({ fontSize: 'HUGE' as FontSize }))
    expect(result).toMatch(/fontSize/i)
  })
})

// ─── Active template selection ────────────────────────────────────────────────

describe('getActiveTemplate', () => {
  const pos1 = makeTpl({ id: '1', type: 'POS', active: true })
  const pos2 = makeTpl({ id: '2', type: 'POS', active: false })
  const delivery = makeTpl({ id: '3', type: 'DELIVERY', active: true })

  it('returns the active template for a given type', () => {
    expect(getActiveTemplate([pos1, pos2, delivery], 'POS')).toEqual(pos1)
  })

  it('returns the first template of the type when none are active', () => {
    expect(getActiveTemplate([pos2], 'POS')).toEqual(pos2)
  })

  it('returns null when no templates match the type', () => {
    expect(getActiveTemplate([delivery], 'RETURNS')).toBeNull()
  })
})

// ─── Default template fallback ────────────────────────────────────────────────

describe('buildDefaultTemplate', () => {
  it('builds a default POS template with correct defaults', () => {
    const tpl = buildDefaultTemplate('store-1', 'POS')
    expect(tpl.storeId).toBe('store-1')
    expect(tpl.type).toBe('POS')
    expect(tpl.fontSize).toBe('MEDIUM')
    expect(tpl.paperWidth).toBe('80mm')
    expect(tpl.active).toBe(true)
    expect(tpl.showLogo).toBe(true)
    expect(tpl.showTax).toBe(true)
  })

  it('builds a DELIVERY template with the correct type label', () => {
    const tpl = buildDefaultTemplate('store-1', 'DELIVERY')
    expect(tpl.type).toBe('DELIVERY')
    expect(TEMPLATE_TYPE_LABELS['DELIVERY']).toBe('Pengiriman')
  })
})
