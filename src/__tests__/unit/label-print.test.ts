import { describe, it, expect } from 'vitest'
import {
  validateLabelFields,
  validateLabelDimensions,
  calcTotalPrintQty,
  countBulkProducts,
  getActiveTemplates,
  findDefaultTemplate,
  validatePrintJob,
} from '@/lib/label-print'
import type { LabelField, LabelTemplate, PrintJobProduct } from '@/lib/label-print'

describe('Label Print Module', () => {
  describe('Template field validation', () => {
    it('should accept valid fields', () => {
      const fields: LabelField[] = [
        { type: 'name', x: 4, y: 6, fontSize: 10 },
        { type: 'price', x: 4, y: 18, fontSize: 12 },
        { type: 'barcode', x: 4, y: 28, fontSize: 8 },
      ]
      const result = validateLabelFields(fields)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject empty fields array', () => {
      const result = validateLabelFields([])
      expect(result.valid).toBe(false)
      expect(result.error).toContain('At least one field')
    })

    it('should reject invalid field type', () => {
      const fields = [{ type: 'invalid', x: 0, y: 0, fontSize: 10 }] as any
      const result = validateLabelFields(fields)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid field type')
    })

    it('should reject negative coordinates', () => {
      const fields: LabelField[] = [{ type: 'name', x: -5, y: 10, fontSize: 10 }]
      const result = validateLabelFields(fields)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('non-negative')
    })

    it('should reject zero or negative fontSize', () => {
      const fields: LabelField[] = [{ type: 'name', x: 0, y: 0, fontSize: 0 }]
      const result = validateLabelFields(fields)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('positive number')
    })

    it('should reject custom field without value', () => {
      const fields: LabelField[] = [{ type: 'custom', x: 0, y: 0, fontSize: 10 }]
      const result = validateLabelFields(fields)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Custom field requires a value')
    })
  })

  describe('Label dimension validation', () => {
    it('should accept valid dimensions', () => {
      const result = validateLabelDimensions(60, 40)
      expect(result.valid).toBe(true)
    })

    it('should reject zero width', () => {
      const result = validateLabelDimensions(0, 40)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Width')
    })

    it('should reject dimensions below minimum', () => {
      const result = validateLabelDimensions(5, 40)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('at least 10mm')
    })

    it('should reject dimensions above maximum', () => {
      const result = validateLabelDimensions(400, 40)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('cannot exceed 300mm')
    })
  })

  describe('Print job quantity calculation', () => {
    it('should calculate total qty correctly', () => {
      const products: PrintJobProduct[] = [
        { productId: 'p1', qty: 5 },
        { productId: 'p2', qty: 3 },
        { productId: 'p3', qty: 2 },
      ]
      expect(calcTotalPrintQty(products)).toBe(10)
    })

    it('should handle single product', () => {
      const products: PrintJobProduct[] = [{ productId: 'p1', qty: 7 }]
      expect(calcTotalPrintQty(products)).toBe(7)
    })

    it('should return 0 for empty array', () => {
      expect(calcTotalPrintQty([])).toBe(0)
    })

    it('should ignore negative quantities', () => {
      const products: PrintJobProduct[] = [
        { productId: 'p1', qty: 5 },
        { productId: 'p2', qty: -2 },
      ]
      expect(calcTotalPrintQty(products)).toBe(5)
    })
  })

  describe('Bulk product count', () => {
    it('should count products with qty > 0', () => {
      const products: PrintJobProduct[] = [
        { productId: 'p1', qty: 5 },
        { productId: 'p2', qty: 1 },
        { productId: 'p3', qty: 0 },
      ]
      expect(countBulkProducts(products)).toBe(2)
    })

    it('should return 0 for empty array', () => {
      expect(countBulkProducts([])).toBe(0)
    })
  })

  describe('Template active selection', () => {
    const templates: LabelTemplate[] = [
      {
        id: 't1',
        storeId: 's1',
        name: 'Active 1',
        width: 60,
        height: 40,
        fields: [],
        active: true,
      },
      {
        id: 't2',
        storeId: 's1',
        name: 'Inactive',
        width: 50,
        height: 30,
        fields: [],
        active: false,
      },
      {
        id: 't3',
        storeId: 's1',
        name: 'Active 2',
        width: 70,
        height: 50,
        fields: [],
        active: true,
      },
    ]

    it('should return only active templates', () => {
      const active = getActiveTemplates(templates)
      expect(active).toHaveLength(2)
      expect(active.every(t => t.active)).toBe(true)
    })

    it('should find default template (first active)', () => {
      const def = findDefaultTemplate(templates)
      expect(def).not.toBeNull()
      expect(def?.id).toBe('t1')
    })

    it('should return null when no active templates', () => {
      const inactiveOnly = templates.map(t => ({ ...t, active: false }))
      const def = findDefaultTemplate(inactiveOnly)
      expect(def).toBeNull()
    })
  })

  describe('Print job validation', () => {
    it('should accept valid print job', () => {
      const products: PrintJobProduct[] = [
        { productId: 'p1', qty: 5 },
        { productId: 'p2', qty: 2 },
      ]
      const result = validatePrintJob(products)
      expect(result.valid).toBe(true)
    })

    it('should reject empty products array', () => {
      const result = validatePrintJob([])
      expect(result.valid).toBe(false)
      expect(result.error).toContain('At least one product')
    })

    it('should reject product without productId', () => {
      const products = [{ productId: '', qty: 1 }] as PrintJobProduct[]
      const result = validatePrintJob(products)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('productId')
    })

    it('should reject product with qty < 1', () => {
      const products: PrintJobProduct[] = [{ productId: 'p1', qty: 0 }]
      const result = validatePrintJob(products)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('qty >= 1')
    })
  })
})
