/**
 * Promotion engine — pure functions, no I/O.
 * Used by the API route and importable in tests.
 */

export type PromotionType =
  | 'PERCENTAGE_OFF'
  | 'FIXED_AMOUNT'
  | 'BUY_X_GET_Y'
  | 'CATEGORY_DISCOUNT'

export type PromotionStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED'

export interface PromotionConditions {
  minOrderAmount?: number
  categoryId?: string
  categoryName?: string
  buyQty?: number
  getQty?: number
}

export interface Promotion {
  id: string
  storeId: string
  name: string
  type: PromotionType
  value: number
  conditions: PromotionConditions
  startDate: string | null
  endDate: string | null
  maxUses: number | null
  usedCount: number
  status: PromotionStatus
  code?: string | null
}

export interface CartItem {
  productId: string
  name: string
  price: number
  qty: number
  subtotal: number
  categoryId?: string | null
  categoryName?: string | null
}

export interface AppliedPromotion {
  promotionId: string
  name: string
  type: PromotionType
  discountAmount: number
  description: string
}

export function isPromotionExpired(promo: Promotion, now = new Date()): boolean {
  if (promo.endDate && new Date(promo.endDate) < now) return true
  if (promo.startDate && new Date(promo.startDate) > now) return true
  return false
}

export function isPromotionMaxedOut(promo: Promotion): boolean {
  if (promo.maxUses === null || promo.maxUses === undefined) return false
  return promo.usedCount >= promo.maxUses
}

export function meetsMinOrder(promo: Promotion, orderTotal: number): boolean {
  const min = promo.conditions.minOrderAmount ?? 0
  return orderTotal >= min
}

export function isPromotionEligible(
  promo: Promotion,
  orderTotal: number,
  now = new Date(),
): boolean {
  if (promo.status === 'INACTIVE') return false
  if (isPromotionExpired(promo, now)) return false
  if (isPromotionMaxedOut(promo)) return false
  if (!meetsMinOrder(promo, orderTotal)) return false
  return true
}

export function calcPercentageOff(promo: Promotion, subtotal: number): number {
  const pct = Math.min(Math.max(promo.value, 0), 100)
  return Math.round((subtotal * pct) / 100)
}

export function calcFixedAmount(promo: Promotion, subtotal: number): number {
  return Math.min(promo.value, subtotal)
}

export function calcBuyXGetY(promo: Promotion, items: CartItem[]): number {
  const buyQty = promo.conditions.buyQty ?? 1
  const getQty = promo.conditions.getQty ?? 1
  const setSize = buyQty + getQty

  const flat: { price: number }[] = []
  for (const item of items) {
    for (let i = 0; i < item.qty; i++) {
      flat.push({ price: item.price })
    }
  }

  const totalQty = flat.length
  const freeSets = Math.floor(totalQty / setSize)
  const freeCount = freeSets * getQty

  const sorted = [...flat].sort((a, b) => a.price - b.price)
  let discount = 0
  for (let i = 0; i < freeCount && i < sorted.length; i++) {
    discount += sorted[i].price
  }
  return discount
}

export function calcCategoryDiscount(promo: Promotion, items: CartItem[]): number {
  const targetCategoryId = promo.conditions.categoryId
  const targetCategoryName = promo.conditions.categoryName?.toLowerCase()
  const pct = Math.min(Math.max(promo.value, 0), 100)

  let eligible = 0
  for (const item of items) {
    const matchById = targetCategoryId && item.categoryId === targetCategoryId
    const matchByName =
      targetCategoryName && item.categoryName?.toLowerCase() === targetCategoryName
    if (matchById || matchByName) {
      eligible += item.subtotal
    }
  }
  return Math.round((eligible * pct) / 100)
}

export function applyPromotions(
  promotions: Promotion[],
  items: CartItem[],
  promoCode?: string | null,
  now = new Date(),
): AppliedPromotion[] {
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0)
  const applied: AppliedPromotion[] = []

  for (const promo of promotions) {
    if (promoCode) {
      if (!promo.code || promo.code.toUpperCase() !== promoCode.toUpperCase()) continue
    } else {
      if (promo.code) continue
    }

    if (!isPromotionEligible(promo, subtotal, now)) continue

    let discountAmount = 0
    let description = ''

    switch (promo.type) {
      case 'PERCENTAGE_OFF':
        discountAmount = calcPercentageOff(promo, subtotal)
        description = `${promo.value}% off seluruh pesanan`
        break
      case 'FIXED_AMOUNT':
        discountAmount = calcFixedAmount(promo, subtotal)
        description = `Potongan Rp ${promo.value.toLocaleString('id-ID')}`
        break
      case 'BUY_X_GET_Y':
        discountAmount = calcBuyXGetY(promo, items)
        description = `Beli ${promo.conditions.buyQty ?? 1} gratis ${promo.conditions.getQty ?? 1}`
        break
      case 'CATEGORY_DISCOUNT':
        discountAmount = calcCategoryDiscount(promo, items)
        description = `${promo.value}% off ${promo.conditions.categoryName ?? 'kategori'}`
        break
    }

    if (discountAmount > 0) {
      applied.push({
        promotionId: promo.id,
        name: promo.name,
        type: promo.type,
        discountAmount,
        description,
      })
    }
  }

  return applied
}

export function totalDiscount(applied: AppliedPromotion[]): number {
  return applied.reduce((s, a) => s + a.discountAmount, 0)
}

export function deriveStatus(
  promo: {
    status: PromotionStatus
    endDate: string | null
    startDate: string | null
    usedCount: number
    maxUses: number | null
  },
  now = new Date(),
): PromotionStatus {
  if (promo.status === 'INACTIVE') return 'INACTIVE'
  if (promo.endDate && new Date(promo.endDate) < now) return 'EXPIRED'
  return 'ACTIVE'
}
