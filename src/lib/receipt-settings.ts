// Receipt printer settings — persisted to localStorage under 'receipt-settings'

export interface ReceiptSettings {
  printWidth: 58 | 80
  fontSize: 'small' | 'medium' | 'large'
  showLogo: boolean
  footerText: string
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  printWidth: 80,
  fontSize: 'medium',
  showLogo: true,
  footerText: 'Terima kasih sudah berbelanja!',
}

export const RECEIPT_SETTINGS_KEY = 'receipt-settings'

export function loadReceiptSettings(): ReceiptSettings {
  if (typeof window === 'undefined') return DEFAULT_RECEIPT_SETTINGS
  try {
    const raw = localStorage.getItem(RECEIPT_SETTINGS_KEY)
    if (!raw) return DEFAULT_RECEIPT_SETTINGS
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_RECEIPT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_RECEIPT_SETTINGS
  }
}

export function saveReceiptSettings(settings: ReceiptSettings): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(RECEIPT_SETTINGS_KEY, JSON.stringify(settings))
}

export function validateReceiptSettings(s: unknown): s is ReceiptSettings {
  if (!s || typeof s !== 'object') return false
  const obj = s as Record<string, unknown>
  if (obj.printWidth !== 58 && obj.printWidth !== 80) return false
  if (!['small', 'medium', 'large'].includes(obj.fontSize as string)) return false
  if (typeof obj.showLogo !== 'boolean') return false
  if (typeof obj.footerText !== 'string') return false
  return true
}

export function generateApiKey(): string {
  // Generates a random UUID v4
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function validateWebhookUrl(url: string): boolean {
  if (!url) return true // optional field
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export const PAYMENT_METHODS = ['CASH', 'CARD', 'QRIS', 'TRANSFER', 'GIFT_CARD'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export interface PaymentMethodSettings {
  enabled: boolean
  label: string
}

export const DEFAULT_PAYMENT_METHODS: Record<PaymentMethod, PaymentMethodSettings> = {
  CASH: { enabled: true, label: 'Tunai' },
  CARD: { enabled: true, label: 'Kartu Debit/Kredit' },
  QRIS: { enabled: true, label: 'QRIS' },
  TRANSFER: { enabled: true, label: 'Transfer Bank' },
  GIFT_CARD: { enabled: false, label: 'Gift Card' },
}

export function togglePaymentMethod(
  current: Record<PaymentMethod, PaymentMethodSettings>,
  method: PaymentMethod,
): Record<PaymentMethod, PaymentMethodSettings> {
  return {
    ...current,
    [method]: { ...current[method], enabled: !current[method].enabled },
  }
}
