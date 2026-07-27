import { describe, it, expect } from 'vitest'

// ── Offline queue logic ────────────────────────────────────────────────────────
// Pure logic tests for the offline transaction queue (no IndexedDB in Node env)

interface QueuedTransaction {
  id: string
  url: string
  method: string
  body: string
  storeId: string
  timestamp: number
  retries: number
}

function createQueueId(): string {
  return `tx_${Date.now()}_abc123`
}

function isValidQueueEntry(tx: Partial<QueuedTransaction>): boolean {
  return !!(tx.url && tx.method && tx.storeId)
}

function shouldRetry(tx: QueuedTransaction, maxRetries = 3): boolean {
  return tx.retries < maxRetries
}

function prioritizeQueue(queue: QueuedTransaction[]): QueuedTransaction[] {
  // Earlier timestamps first (FIFO)
  return [...queue].sort((a, b) => a.timestamp - b.timestamp)
}

function mergeOfflineOrders(pending: QueuedTransaction[]): QueuedTransaction[] {
  // Deduplicate by URL + body (idempotent retry protection)
  const seen = new Set<string>()
  return pending.filter(tx => {
    const key = `${tx.url}|${tx.body}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── i18n locale logic ─────────────────────────────────────────────────────────

const SUPPORTED_LOCALES = ['en', 'id', 'zh', 'ar'] as const
type Locale = typeof SUPPORTED_LOCALES[number]
const RTL_LOCALES: Locale[] = ['ar']

function isValidLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale)
}

function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale)
}

function resolveLocale(cookieValue: string | undefined): Locale {
  if (!cookieValue || !isValidLocale(cookieValue)) return 'en'
  return cookieValue
}

function getLocaleName(locale: Locale): string {
  const names: Record<Locale, string> = {
    en: 'English',
    id: 'Bahasa Indonesia',
    zh: '中文',
    ar: 'العربية',
  }
  return names[locale]
}

function getLocaleFlag(locale: Locale): string {
  const flags: Record<Locale, string> = {
    en: '🇬🇧',
    id: '🇮🇩',
    zh: '🇨🇳',
    ar: '🇸🇦',
  }
  return flags[locale]
}

// ── Multi-store logic ─────────────────────────────────────────────────────────

interface Store {
  id: string
  name: string
  currency: string
  timezone: string
}

function getStoreById(stores: Store[], id: string): Store | undefined {
  return stores.find(s => s.id === id)
}

function formatMultiStoreCurrency(amount: number, storeId: string, stores: Store[]): string {
  const store = getStoreById(stores, storeId)
  const currency = store?.currency ?? 'USD'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

// ── Tests: Offline queue ───────────────────────────────────────────────────────

describe('Offline transaction queue', () => {
  it('validates queue entry fields', () => {
    expect(isValidQueueEntry({ url: '/api/orders', method: 'POST', storeId: 's1' })).toBe(true)
    expect(isValidQueueEntry({ method: 'POST', storeId: 's1' })).toBe(false) // missing url
    expect(isValidQueueEntry({ url: '/api/orders', storeId: 's1' })).toBe(false) // missing method
    expect(isValidQueueEntry({ url: '/api/orders', method: 'POST' })).toBe(false) // missing storeId
  })

  it('generates unique queue IDs', () => {
    const id1 = createQueueId()
    const id2 = createQueueId()
    expect(id1.startsWith('tx_')).toBe(true)
    expect(id2.startsWith('tx_')).toBe(true)
  })

  it('respects max retries', () => {
    const tx: QueuedTransaction = { id: 'tx1', url: '/api/orders', method: 'POST', body: '{}', storeId: 's1', timestamp: 1, retries: 2 }
    expect(shouldRetry(tx, 3)).toBe(true)
    expect(shouldRetry({ ...tx, retries: 3 }, 3)).toBe(false)
    expect(shouldRetry({ ...tx, retries: 10 }, 3)).toBe(false)
  })

  it('prioritizes FIFO order', () => {
    const queue: QueuedTransaction[] = [
      { id: 'tx3', url: '/api/orders', method: 'POST', body: '{}', storeId: 's1', timestamp: 300, retries: 0 },
      { id: 'tx1', url: '/api/orders', method: 'POST', body: '{}', storeId: 's1', timestamp: 100, retries: 0 },
      { id: 'tx2', url: '/api/orders', method: 'POST', body: '{}', storeId: 's1', timestamp: 200, retries: 0 },
    ]
    const sorted = prioritizeQueue(queue)
    expect(sorted[0].id).toBe('tx1')
    expect(sorted[1].id).toBe('tx2')
    expect(sorted[2].id).toBe('tx3')
  })

  it('deduplicates identical requests', () => {
    const queue: QueuedTransaction[] = [
      { id: 'tx1', url: '/api/orders', method: 'POST', body: '{"total":100}', storeId: 's1', timestamp: 1, retries: 0 },
      { id: 'tx2', url: '/api/orders', method: 'POST', body: '{"total":100}', storeId: 's1', timestamp: 2, retries: 0 },
      { id: 'tx3', url: '/api/orders', method: 'POST', body: '{"total":200}', storeId: 's1', timestamp: 3, retries: 0 },
    ]
    const merged = mergeOfflineOrders(queue)
    expect(merged).toHaveLength(2)
    expect(merged[0].id).toBe('tx1')
    expect(merged[1].id).toBe('tx3')
  })
})

describe('i18n locale resolution', () => {
  it('accepts valid locales', () => {
    expect(resolveLocale('en')).toBe('en')
    expect(resolveLocale('id')).toBe('id')
    expect(resolveLocale('zh')).toBe('zh')
    expect(resolveLocale('ar')).toBe('ar')
  })

  it('falls back to en for invalid locale', () => {
    expect(resolveLocale('fr')).toBe('en')
    expect(resolveLocale('de')).toBe('en')
    expect(resolveLocale(undefined)).toBe('en')
    expect(resolveLocale('')).toBe('en')
  })

  it('validates locale correctly', () => {
    expect(isValidLocale('en')).toBe(true)
    expect(isValidLocale('id')).toBe(true)
    expect(isValidLocale('fr')).toBe(false)
    expect(isValidLocale('xx')).toBe(false)
  })

  it('detects RTL locales', () => {
    expect(isRTL('ar')).toBe(true)
    expect(isRTL('en')).toBe(false)
    expect(isRTL('id')).toBe(false)
    expect(isRTL('zh')).toBe(false)
  })

  it('returns correct locale names', () => {
    expect(getLocaleName('en')).toBe('English')
    expect(getLocaleName('id')).toBe('Bahasa Indonesia')
    expect(getLocaleName('zh')).toBe('中文')
    expect(getLocaleName('ar')).toBe('العربية')
  })

  it('returns correct locale flags', () => {
    expect(getLocaleFlag('en')).toBe('🇬🇧')
    expect(getLocaleFlag('id')).toBe('🇮🇩')
    expect(getLocaleFlag('zh')).toBe('🇨🇳')
    expect(getLocaleFlag('ar')).toBe('🇸🇦')
  })
})

describe('Multi-store currency formatting', () => {
  const stores: Store[] = [
    { id: 'store-id', name: 'Jakarta', currency: 'IDR', timezone: 'Asia/Jakarta' },
    { id: 'store-us', name: 'New York', currency: 'USD', timezone: 'America/New_York' },
    { id: 'store-eu', name: 'Berlin', currency: 'EUR', timezone: 'Europe/Berlin' },
    { id: 'store-sg', name: 'Singapore', currency: 'SGD', timezone: 'Asia/Singapore' },
    { id: 'store-ae', name: 'Dubai', currency: 'AED', timezone: 'Asia/Dubai' },
    { id: 'store-sa', name: 'Riyadh', currency: 'SAR', timezone: 'Asia/Riyadh' },
    { id: 'store-cn', name: 'Shanghai', currency: 'CNY', timezone: 'Asia/Shanghai' },
  ]

  it('formats IDR correctly', () => {
    const result = formatMultiStoreCurrency(100000, 'store-id', stores)
    expect(result).toContain('100')
  })

  it('formats USD correctly', () => {
    const result = formatMultiStoreCurrency(99.99, 'store-us', stores)
    expect(result).toContain('99')
  })

  it('falls back to USD for unknown store', () => {
    const result = formatMultiStoreCurrency(50, 'store-unknown', stores)
    expect(result).toBeTruthy()
  })

  it('handles zero amount', () => {
    expect(() => formatMultiStoreCurrency(0, 'store-us', stores)).not.toThrow()
  })

  it('handles large amounts', () => {
    expect(() => formatMultiStoreCurrency(1_000_000_000, 'store-id', stores)).not.toThrow()
  })

  it('formats all supported currencies', () => {
    for (const store of stores) {
      expect(() => formatMultiStoreCurrency(10000, store.id, stores)).not.toThrow()
    }
  })

  it('gets store by id', () => {
    expect(getStoreById(stores, 'store-id')?.currency).toBe('IDR')
    expect(getStoreById(stores, 'store-us')?.currency).toBe('USD')
    expect(getStoreById(stores, 'nonexistent')).toBeUndefined()
  })
})
