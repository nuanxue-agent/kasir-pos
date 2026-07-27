// ─── Gift Card pure helpers ───────────────────────────────────────────────────
// All functions are pure / side-effect-free so they can be tested in isolation.

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const CODE_LENGTH = 16

/**
 * Generate a random 16-character uppercase alphanumeric gift card code.
 * Uses crypto.getRandomValues when available (browser + Node 15+), falls back
 * to Math.random for environments that don't have it.
 */
export function generateGiftCardCode(): string {
  const chars = CODE_CHARS
  let code = ''
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(CODE_LENGTH)
    crypto.getRandomValues(bytes)
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += chars[bytes[i] % chars.length]
    }
  } else {
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
  }
  return code
}

/**
 * Deduct `amount` from a gift card balance.
 * Returns `{ newBalance, applied }` where:
 *   - applied  = amount actually consumed (capped at balance)
 *   - newBalance = remaining balance after deduction
 */
export function deductGiftCardBalance(
  currentBalance: number,
  amount: number,
): { newBalance: number; applied: number } {
  if (amount <= 0 || currentBalance <= 0) {
    return { newBalance: Math.max(0, currentBalance), applied: 0 }
  }
  const applied = Math.min(amount, currentBalance)
  return { newBalance: currentBalance - applied, applied }
}

export type GiftCardStatus = 'ACTIVE' | 'USED' | 'EXPIRED'

/**
 * Determine the effective status of a gift card.
 * A card is EXPIRED if expiresAt is in the past (even if it still has balance).
 * A card is USED if its balance is 0.
 * Otherwise ACTIVE.
 */
export function resolveGiftCardStatus(
  balance: number,
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): GiftCardStatus {
  if (expiresAt && new Date(expiresAt) < now) return 'EXPIRED'
  if (balance <= 0) return 'USED'
  return 'ACTIVE'
}

/**
 * Validate that a gift card is redeemable.
 * Returns null when valid, or an error string.
 */
export function validateGiftCardRedemption(
  status: GiftCardStatus,
  balance: number,
  requestedAmount: number,
): string | null {
  if (status === 'EXPIRED') return 'Gift card has expired'
  if (status === 'USED') return 'Gift card has already been fully used'
  if (balance <= 0) return 'Gift card has no remaining balance'
  if (requestedAmount <= 0) return 'Redemption amount must be greater than 0'
  return null
}

/**
 * Calculate how much of an order total a gift card will cover and what
 * change (remaining balance) to show the customer.
 *
 * Returns:
 *   - appliedAmount   = how much is deducted from the order total
 *   - remainingBalance = balance left on the card after this transaction
 */
export function applyGiftCardToOrder(
  orderTotal: number,
  cardBalance: number,
): { appliedAmount: number; remainingBalance: number } {
  const appliedAmount = Math.min(orderTotal, cardBalance)
  const remainingBalance = cardBalance - appliedAmount
  return { appliedAmount, remainingBalance }
}

/** True when a code string looks like a valid gift card code (16 uppercase alphanumeric). */
export function isValidGiftCardCode(code: string): boolean {
  return /^[A-Z0-9]{16}$/.test(code)
}
