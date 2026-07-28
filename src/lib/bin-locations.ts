// Pure bin-location helpers — no React, safe to import from tests and API routes

export function generateBinCode(aisle: string, rack: string, shelf: string, bin: string): string {
  return `${aisle.toUpperCase()}-${rack.toUpperCase()}-${shelf.toUpperCase()}-${bin.toUpperCase()}`
}

export function calcCapacityUtilization(currentQty: number, capacity: number): number {
  if (capacity <= 0) return 0
  return Math.min(100, Math.round((currentQty / capacity) * 100))
}

export function calcAvailableSpace(currentQty: number, capacity: number): number {
  return Math.max(0, capacity - currentQty)
}

export function validateTransfer(
  qty: number,
  fromBinCurrentQty: number,
  toBinAvailableSpace: number,
): { valid: boolean; error?: string } {
  if (qty <= 0) return { valid: false, error: 'Qty harus lebih dari 0' }
  if (qty > fromBinCurrentQty) return { valid: false, error: 'Stok di bin sumber tidak cukup' }
  if (qty > toBinAvailableSpace) return { valid: false, error: 'Ruang di bin tujuan tidak cukup' }
  return { valid: true }
}

export interface BinLocation {
  id: string
  warehouseId: string
  storeId: string
  code: string
  aisle: string
  rack: string
  shelf: string
  bin: string
  capacity: number
  currentQty: number
  active: boolean
  createdAt: string
}

export interface BinProduct {
  id: string
  binId: string
  storeId: string
  productId: string
  productName?: string
  sku?: string | null
  qty: number
  lotId?: string | null
}

export interface BinTransfer {
  id: string
  storeId: string
  fromBinId: string
  toBinId: string
  productId: string
  qty: number
  note?: string | null
  createdAt: string
  fromBinCode?: string
  toBinCode?: string
  productName?: string
  productSku?: string | null
}

export function findBinsByProduct(bins: BinProduct[], productId: string): BinProduct[] {
  return bins.filter(bp => bp.productId === productId && bp.qty > 0)
}
