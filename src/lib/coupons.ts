/**
 * Pure coupon business logic — no DB deps, fully testable.
 */

export type DiscountType = 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING' | 'BOGO'

export interface Coupon {
  id: string
  storeId: string
  code: string
  name: string
  discountType: DiscountType
  discountValue: number
  minOrderAmount: number
  maxDiscount: number | null
  usageLimit: number | null
  usedCount: number
  perCustomerLimit: number | null
  segments: string[]       // customer segment IDs
  productIds: string[]
  categoryIds: string[]
  startDate: string | null
  endDate: string | null
  active: boolean
}

export interface CouponValidationInput {
  coupon: Coupon
  orderAmount: number
  customerId: string
  customerUsageCount: number
  now?: Date
}

export interface CouponValidationResult {
  valid: boolean
  discount: number
  reason?: string
}

// ─── Discount calculators ────────────────────────────────────────────────────

export function calcPercentageDiscount(orderAmount: number, pct: number, maxDiscount: number | null): number {
  const raw = orderAmount * (pct / 100)
  if (maxDiscount !== null && maxDiscount > 0) return Math.min(raw, maxDiscount)
  return raw
}

export function calcFixedDiscount(orderAmount: number, fixed: number): number {
  return Math.min(fixed, orderAmount)
}

export function calcDiscount(coupon: Coupon, orderAmount: number): number {
  switch (coupon.discountType) {
    case 'PERCENTAGE':
      return calcPercentageDiscount(orderAmount, coupon.discountValue, coupon.maxDiscount)
    case 'FIXED':
      return calcFixedDiscount(orderAmount, coupon.discountValue)
    case 'FREE_SHIPPING':
      // shipping fee represented as discountValue
      return coupon.discountValue
    case 'BOGO':
      // 50% off the order (buy-one-get-one modelled as half-price)
      return orderAmount * 0.5
    default:
      return 0
  }
}

// ─── Validators ──────────────────────────────────────────────────────────────

export function isCouponActive(coupon: Coupon): boolean {
  return coupon.active
}

export function isCouponExpired(coupon: Coupon, now = new Date()): boolean {
  if (coupon.endDate) {
    const end = new Date(coupon.endDate)
    if (now > end) return true
  }
  if (coupon.startDate) {
    const start = new Date(coupon.startDate)
    if (now < start) return true
  }
  return false
}

export function meetsMinOrder(coupon: Coupon, orderAmount: number): boolean {
  return orderAmount >= coupon.minOrderAmount
}

export function isWithinUsageLimit(coupon: Coupon): boolean {
  if (coupon.usageLimit === null) return true
  return coupon.usedCount < coupon.usageLimit
}

export function isWithinPerCustomerLimit(coupon: Coupon, customerUsageCount: number): boolean {
  if (coupon.perCustomerLimit === null) return true
  return customerUsageCount < coupon.perCustomerLimit
}

// ─── Full validation ─────────────────────────────────────────────────────────

export function validateCoupon(input: CouponValidationInput): CouponValidationResult {
  const { coupon, orderAmount, customerUsageCount, now = new Date() } = input

  if (!isCouponActive(coupon)) {
    return { valid: false, discount: 0, reason: 'Kupon tidak aktif' }
  }

  if (isCouponExpired(coupon, now)) {
    return { valid: false, discount: 0, reason: 'Kupon sudah kadaluarsa' }
  }

  if (!meetsMinOrder(coupon, orderAmount)) {
    return { valid: false, discount: 0, reason: `Minimum pembelian ${coupon.minOrderAmount}` }
  }

  if (!isWithinUsageLimit(coupon)) {
    return { valid: false, discount: 0, reason: 'Kupon sudah habis digunakan' }
  }

  if (!isWithinPerCustomerLimit(coupon, customerUsageCount)) {
    return { valid: false, discount: 0, reason: 'Batas penggunaan per pelanggan tercapai' }
  }

  const discount = calcDiscount(coupon, orderAmount)
  return { valid: true, discount }
}

// ─── Analytics helpers ───────────────────────────────────────────────────────

export interface CouponAnalytics {
  couponId: string
  code: string
  name: string
  usedCount: number
  usageLimit: number | null
  usageRate: number       // 0–1; null usageLimit → -1 (unlimited)
  totalDiscount: number
}

export function calcUsageRate(usedCount: number, usageLimit: number | null): number {
  if (usageLimit === null || usageLimit <= 0) return -1
  return usedCount / usageLimit
}
