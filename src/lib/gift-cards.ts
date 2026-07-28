// Pure business logic for gift card module — no DB/Next.js imports

export type GiftCardStatus = 'ACTIVE' | 'REDEEMED' | 'USED' | 'EXPIRED' | 'DISABLED'

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function generateGiftCardCode(): string {
  let code = ''
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  for (let i = 0; i < 16; i++) {
    code += CHARS[buf[i] % CHARS.length]
  }
  return code
}

export function isValidGiftCardCode(code: string): boolean {
  return /^[A-Z0-9]{16}$/.test(code)
}

/**
 * Deduct `amount` from `currentBalance`. Applied amount is capped at balance.
 */
export function deductGiftCardBalance(
  currentBalance: number,
  amount: number,
): { newBalance: number; applied: number } {
  if (currentBalance <= 0 || amount <= 0) {
    return { newBalance: currentBalance, applied: 0 }
  }
  const applied = Math.min(currentBalance, amount)
  return { newBalance: currentBalance - applied, applied }
}

/**
 * Derive a card's current status from its balance and expiry.
 * NOTE: this does NOT override DISABLED — callers should check the DB status first.
 */
export function resolveGiftCardStatus(
  balance: number,
  expiresAt: string | null | undefined,
): GiftCardStatus {
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return 'EXPIRED'
  if (balance <= 0) return 'USED'
  return 'ACTIVE'
}

/**
 * Validate that a redemption is allowed. Returns null on success, error string on failure.
 */
export function validateGiftCardRedemption(
  status: string,
  balance: number,
  requestedAmount: number,
): string | null {
  if (status === 'EXPIRED') return 'Gift card sudah kadaluarsa'
  if (status === 'REDEEMED' || status === 'USED') return 'Gift card sudah habis digunakan'
  if (status === 'DISABLED') return 'Gift card dinonaktifkan'
  if (requestedAmount <= 0) return 'Jumlah redeem harus lebih dari 0'
  if (balance <= 0) return 'Saldo gift card sudah habis'
  return null
}

/**
 * Apply a gift card balance toward an order total.
 * Returns how much was applied and the remaining card balance.
 */
export function applyGiftCardToOrder(
  orderTotal: number,
  cardBalance: number,
): { appliedAmount: number; remainingBalance: number } {
  const appliedAmount = Math.min(orderTotal, cardBalance)
  const remainingBalance = cardBalance - appliedAmount
  return { appliedAmount, remainingBalance }
}
