import { describe, it, expect } from 'vitest'

// ── Shortcut definitions ──────────────────────────────────────────────────────

interface ShortcutDef {
  key: string
  action: string
}

const SHORTCUTS: ShortcutDef[] = [
  { key: 'F2', action: 'focusSearch' },
  { key: 'F3', action: 'openScanner' },
  { key: 'Escape', action: 'closeModal' },
  { key: '/', action: 'focusSearch' },
]

function getShortcutAction(key: string): string | null {
  return SHORTCUTS.find(s => s.key === key)?.action ?? null
}

// ── Manual barcode input validation ──────────────────────────────────────────

interface Product {
  id: string
  name: string
  sku?: string | null
  barcode?: string | null
}

function matchBarcode(value: string, products: Product[]): Product | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return (
    products.find(p => (p.sku && p.sku === trimmed) || (p.barcode && p.barcode === trimmed)) ?? null
  )
}

function isValidBarcodeInput(value: string): boolean {
  return value.trim().length >= 4
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POS keyboard shortcuts', () => {
  describe('shortcut key uniqueness', () => {
    it('all shortcut keys are unique', () => {
      const keys = SHORTCUTS.map(s => s.key)
      const unique = new Set(keys)
      expect(unique.size).toBe(keys.length)
    })
  })

  describe('F2 — focus search', () => {
    it('F2 maps to focusSearch action', () => {
      expect(getShortcutAction('F2')).toBe('focusSearch')
    })

    it('/ also maps to focusSearch action', () => {
      expect(getShortcutAction('/')).toBe('focusSearch')
    })
  })

  describe('F3 — open scanner', () => {
    it('F3 maps to openScanner action', () => {
      expect(getShortcutAction('F3')).toBe('openScanner')
    })

    it('F3 is distinct from the F2 search shortcut', () => {
      expect(getShortcutAction('F3')).not.toBe(getShortcutAction('F2'))
    })
  })

  describe('Escape — close modals', () => {
    it('Escape maps to closeModal action', () => {
      expect(getShortcutAction('Escape')).toBe('closeModal')
    })

    it('Escape is distinct from search shortcuts', () => {
      expect(getShortcutAction('Escape')).not.toBe('focusSearch')
    })
  })

  describe('manual barcode input validation', () => {
    const products: Product[] = [
      { id: '1', name: 'Nasi Goreng', sku: 'SKU-001', barcode: '8991234567890' },
      { id: '2', name: 'Es Teh', sku: 'SKU-002', barcode: '8997654321098' },
    ]

    it('matches product by barcode', () => {
      const result = matchBarcode('8991234567890', products)
      expect(result?.id).toBe('1')
    })

    it('matches product by SKU', () => {
      const result = matchBarcode('SKU-002', products)
      expect(result?.id).toBe('2')
    })

    it('returns null for unknown barcode', () => {
      expect(matchBarcode('0000000000000', products)).toBeNull()
    })

    it('rejects empty / whitespace-only input', () => {
      expect(isValidBarcodeInput('')).toBe(false)
      expect(isValidBarcodeInput('   ')).toBe(false)
    })

    it('accepts input with 4+ characters', () => {
      expect(isValidBarcodeInput('1234')).toBe(true)
      expect(isValidBarcodeInput('SKU-001')).toBe(true)
    })

    it('rejects input shorter than 4 characters', () => {
      expect(isValidBarcodeInput('abc')).toBe(false)
      expect(isValidBarcodeInput('12')).toBe(false)
    })
  })
})
