// Pure business logic for label printing — no DB deps, fully testable

export type LabelFieldType = 'name' | 'price' | 'barcode' | 'qr' | 'sku' | 'custom'

export interface LabelField {
  type: LabelFieldType
  x: number
  y: number
  fontSize: number
  value?: string // for 'custom' type
}

export interface LabelTemplate {
  id: string
  storeId: string
  name: string
  width: number   // mm
  height: number  // mm
  fields: LabelField[]
  active: boolean
}

export interface PrintJobProduct {
  productId: string
  qty: number
}

export interface LabelPrintJob {
  id: string
  storeId: string
  templateId: string
  products: PrintJobProduct[]
  status: 'PENDING' | 'PRINTED'
  createdAt: string
}

// Validation

export function validateLabelFields(fields: LabelField[]): { valid: boolean; error?: string } {
  if (!Array.isArray(fields)) return { valid: false, error: 'fields must be an array' }
  if (fields.length === 0) return { valid: false, error: 'At least one field is required' }

  const validTypes: LabelFieldType[] = ['name', 'price', 'barcode', 'qr', 'sku', 'custom']

  for (const field of fields) {
    if (!validTypes.includes(field.type)) {
      return { valid: false, error: `Invalid field type: ${field.type}` }
    }
    if (typeof field.x !== 'number' || field.x < 0) {
      return { valid: false, error: 'Field x must be a non-negative number' }
    }
    if (typeof field.y !== 'number' || field.y < 0) {
      return { valid: false, error: 'Field y must be a non-negative number' }
    }
    if (typeof field.fontSize !== 'number' || field.fontSize <= 0) {
      return { valid: false, error: 'Field fontSize must be a positive number' }
    }
    if (field.type === 'custom' && !field.value) {
      return { valid: false, error: 'Custom field requires a value' }
    }
  }

  return { valid: true }
}

export function validateLabelDimensions(width: number, height: number): { valid: boolean; error?: string } {
  if (typeof width !== 'number' || width <= 0) {
    return { valid: false, error: 'Width must be a positive number' }
  }
  if (typeof height !== 'number' || height <= 0) {
    return { valid: false, error: 'Height must be a positive number' }
  }
  if (width < 10) {
    return { valid: false, error: 'Width must be at least 10mm' }
  }
  if (height < 10) {
    return { valid: false, error: 'Height must be at least 10mm' }
  }
  if (width > 300) {
    return { valid: false, error: 'Width cannot exceed 300mm' }
  }
  if (height > 300) {
    return { valid: false, error: 'Height cannot exceed 300mm' }
  }
  return { valid: true }
}

export function calcTotalPrintQty(products: PrintJobProduct[]): number {
  return products.reduce((sum, p) => sum + Math.max(0, p.qty), 0)
}

export function countBulkProducts(products: PrintJobProduct[]): number {
  return products.filter(p => p.qty > 0).length
}

export function getActiveTemplates(templates: LabelTemplate[]): LabelTemplate[] {
  return templates.filter(t => t.active)
}

export function findDefaultTemplate(templates: LabelTemplate[]): LabelTemplate | null {
  const active = getActiveTemplates(templates)
  return active.length > 0 ? active[0] : null
}

export function validatePrintJob(products: PrintJobProduct[]): { valid: boolean; error?: string } {
  if (!Array.isArray(products) || products.length === 0) {
    return { valid: false, error: 'At least one product is required' }
  }
  for (const p of products) {
    if (!p.productId) return { valid: false, error: 'Each product must have a productId' }
    if (typeof p.qty !== 'number' || p.qty < 1) {
      return { valid: false, error: 'Each product must have qty >= 1' }
    }
  }
  return { valid: true }
}
