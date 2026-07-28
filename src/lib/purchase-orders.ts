// Pure business logic for Purchase Order module — no DB/Next.js imports

export type POStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED'

export interface PurchaseOrderItem {
  id: string
  poId: string
  storeId: string
  productId: string
  productName?: string
  qty: number
  unitPrice: number
  total: number
  receivedQty?: number
}

export interface PurchaseOrder {
  id: string
  storeId: string
  vendorId: string
  vendorName?: string
  poNumber: string
  status: POStatus
  orderDate: string
  expectedDate?: string | null
  subtotal: number
  taxAmount: number
  total: number
  notes?: string | null
  items?: PurchaseOrderItem[]
}

// Status transitions allowed from each state
const VALID_TRANSITIONS: Record<POStatus, POStatus[]> = {
  DRAFT:     ['SENT', 'CANCELLED'],
  SENT:      ['PARTIAL', 'RECEIVED', 'CANCELLED'],
  PARTIAL:   ['RECEIVED', 'CANCELLED'],
  RECEIVED:  [],
  CANCELLED: [],
}

export function isValidStatusTransition(from: POStatus, to: POStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function canReceiveGoods(status: POStatus): boolean {
  return status === 'SENT' || status === 'PARTIAL'
}

export function calcPOSubtotal(items: PurchaseOrderItem[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
}

export function calcPOTax(subtotal: number, taxRate: number): number {
  return Math.round(subtotal * taxRate)
}

export function calcPOTotal(subtotal: number, taxAmount: number): number {
  return subtotal + taxAmount
}

export function isPartiallyReceived(items: PurchaseOrderItem[]): boolean {
  if (items.length === 0) return false
  const hasReceived = items.some(i => (i.receivedQty ?? 0) > 0)
  const hasRemaining = items.some(i => (i.receivedQty ?? 0) < i.qty)
  return hasReceived && hasRemaining
}

export function isFullyReceived(items: PurchaseOrderItem[]): boolean {
  if (items.length === 0) return false
  return items.every(i => (i.receivedQty ?? 0) >= i.qty)
}

export function deriveStatus(items: PurchaseOrderItem[], currentStatus: POStatus): POStatus {
  if (currentStatus === 'CANCELLED' || currentStatus === 'DRAFT' || currentStatus === 'SENT') {
    return currentStatus
  }
  if (isFullyReceived(items)) return 'RECEIVED'
  if (isPartiallyReceived(items)) return 'PARTIAL'
  return currentStatus
}

export function generatePONumber(storePrefix: string, year: number, seq: number): string {
  return `PO-${storePrefix}-${year}-${String(seq).padStart(4, '0')}`
}

export function calcReceiptProgress(items: PurchaseOrderItem[]): number {
  if (items.length === 0) return 0
  const totalOrdered = items.reduce((s, i) => s + i.qty, 0)
  const totalReceived = items.reduce((s, i) => s + (i.receivedQty ?? 0), 0)
  if (totalOrdered === 0) return 0
  return Math.min(100, Math.round((totalReceived / totalOrdered) * 100))
}
