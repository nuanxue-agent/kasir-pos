// Pure business logic for supplier contracts — no DB deps, fully testable

export type ContractStatus = 'ACTIVE' | 'EXPIRED' | 'DRAFT' | 'TERMINATED'

export interface SupplierContract {
  id: string
  storeId: string
  vendorId: string
  contractNumber: string
  startDate: string
  endDate: string
  paymentTerms: string
  status: ContractStatus
  notes?: string | null
  createdAt: string
  updatedAt: string
  vendorName?: string
}

export interface ContractPriceLine {
  id: string
  contractId: string
  storeId: string
  productId: string
  unitPrice: number
  minOrderQty: number
  validFrom: string
  validTo: string
  productName?: string
  standardPrice?: number
}

export interface BestPriceResult {
  contractId: string
  contractNumber: string
  unitPrice: number
  minOrderQty: number
  savings: number
  savingsPct: number
}

/**
 * Check if a contract is currently valid (ACTIVE and within date range).
 */
export function isContractValid(contract: SupplierContract, now = new Date()): boolean {
  if (contract.status !== 'ACTIVE') return false
  const start = new Date(contract.startDate)
  const end = new Date(contract.endDate)
  return now >= start && now <= end
}

/**
 * Check if a contract is expiring within the given number of days.
 */
export function isContractExpiringSoon(
  contract: SupplierContract,
  withinDays = 30,
  now = new Date(),
): boolean {
  if (contract.status === 'EXPIRED' || contract.status === 'TERMINATED') return false
  const end = new Date(contract.endDate)
  const diffMs = end.getTime() - now.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays <= withinDays
}

/**
 * Compute the derived status of a contract based on dates.
 * DRAFT and TERMINATED are terminal — never auto-change.
 */
export function deriveContractStatus(
  contract: Pick<SupplierContract, 'status' | 'startDate' | 'endDate'>,
  now = new Date(),
): ContractStatus {
  if (contract.status === 'DRAFT' || contract.status === 'TERMINATED') return contract.status
  const end = new Date(contract.endDate)
  if (now > end) return 'EXPIRED'
  const start = new Date(contract.startDate)
  if (now >= start) return 'ACTIVE'
  return contract.status
}

/**
 * Check if a price line is valid for the given date.
 */
export function isPriceLineActive(line: ContractPriceLine, now = new Date()): boolean {
  const from = new Date(line.validFrom)
  const to = new Date(line.validTo)
  return now >= from && now <= to
}

/**
 * Find all active price lines for a product from a list of price lines.
 */
export function getPriceLinesForProduct(
  lines: ContractPriceLine[],
  productId: string,
  now = new Date(),
): ContractPriceLine[] {
  return lines.filter(l => l.productId === productId && isPriceLineActive(l, now))
}

/**
 * Select the best (lowest) contract price for a product given a required quantity.
 * Respects minOrderQty — only returns lines where qty >= minOrderQty.
 */
export function selectBestPrice(
  lines: ContractPriceLine[],
  productId: string,
  qty: number,
  standardPrice: number,
  now = new Date(),
): BestPriceResult | null {
  const eligible = getPriceLinesForProduct(lines, productId, now).filter(
    l => qty >= l.minOrderQty,
  )
  if (eligible.length === 0) return null

  const best = eligible.reduce((a, b) => (a.unitPrice <= b.unitPrice ? a : b))
  const savings = standardPrice - best.unitPrice
  const savingsPct = standardPrice > 0 ? (savings / standardPrice) * 100 : 0

  return {
    contractId: best.contractId,
    contractNumber: '',
    unitPrice: best.unitPrice,
    minOrderQty: best.minOrderQty,
    savings,
    savingsPct,
  }
}

/**
 * Enforce minimum order quantity — returns true if qty meets the requirement.
 */
export function meetsMinOrderQty(line: ContractPriceLine, qty: number): boolean {
  return qty >= line.minOrderQty
}

/**
 * Calculate savings between contract price and standard price.
 */
export function calcPriceSavings(
  contractPrice: number,
  standardPrice: number,
): { savings: number; savingsPct: number } {
  const savings = standardPrice - contractPrice
  const savingsPct = standardPrice > 0 ? (savings / standardPrice) * 100 : 0
  return { savings, savingsPct }
}

/**
 * Filter contracts expiring within N days from a list.
 */
export function getExpiringContracts(
  contracts: SupplierContract[],
  withinDays = 30,
  now = new Date(),
): SupplierContract[] {
  return contracts.filter(c => isContractExpiringSoon(c, withinDays, now))
}
