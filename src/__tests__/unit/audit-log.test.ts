import { describe, it, expect } from 'vitest'

// ─── Types ────────────────────────────────────────────────────────────────────

type SecurityEventType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'FAILED_LOGIN'
  | 'PERMISSION_DENIED'
  | 'VOID_TRANSACTION'
  | 'DISCOUNT_OVERRIDE'
  | 'PRICE_OVERRIDE'

type SecurityEventSeverity = 'LOW' | 'MEDIUM' | 'HIGH'

interface AuditLogEntry {
  id: string
  storeId: string
  userId: string
  action: string
  entityType: string | null
  entityId: string | null
  oldValue: Record<string, unknown> | null
  newValue: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

interface SecurityEvent {
  id: string
  storeId: string
  userId: string | null
  type: SecurityEventType
  severity: SecurityEventSeverity
  description: string | null
  createdAt: string
}

// ─── Pure helpers (mirrors AuditLogClient exports) ────────────────────────────

function categorizeAction(action: string): 'auth' | 'pos' | 'admin' | 'inventory' | 'other' {
  if (['LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'PERMISSION_DENIED'].includes(action)) return 'auth'
  if (['ORDER_CREATE', 'ORDER_REFUND', 'ORDER_VOID', 'VOID_TRANSACTION',
       'DISCOUNT_OVERRIDE', 'PRICE_OVERRIDE', 'SHIFT_OPEN', 'SHIFT_CLOSE'].includes(action)) return 'pos'
  if (['USER_CREATE', 'USER_UPDATE', 'STORE_UPDATE'].includes(action)) return 'admin'
  if (['STOCK_ADJUST', 'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_DELETE'].includes(action)) return 'inventory'
  return 'other'
}

function classifyEventSeverity(type: SecurityEventType): SecurityEventSeverity {
  if (['FAILED_LOGIN', 'PERMISSION_DENIED', 'VOID_TRANSACTION'].includes(type)) return 'HIGH'
  if (['DISCOUNT_OVERRIDE', 'PRICE_OVERRIDE'].includes(type)) return 'MEDIUM'
  return 'LOW'
}

function filterEntriesByDate(
  entries: AuditLogEntry[],
  from?: string,
  to?: string,
): AuditLogEntry[] {
  return entries.filter(e => {
    if (from && e.createdAt < from) return false
    if (to && e.createdAt > to + 'T23:59:59.999Z') return false
    return true
  })
}

function countEventsByType(events: SecurityEvent[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const ev of events) {
    counts[ev.type] = (counts[ev.type] ?? 0) + 1
  }
  return counts
}

function verifyAuditIntegrity(entries: AuditLogEntry[]): { valid: boolean; issues: string[] } {
  const issues: string[] = []
  const ids = new Set<string>()
  for (const e of entries) {
    if (!e.id) issues.push('Entry missing id')
    if (ids.has(e.id)) issues.push(`Duplicate id: ${e.id}`)
    ids.add(e.id)
    if (!e.storeId) issues.push(`Entry ${e.id}: missing storeId`)
    if (!e.userId) issues.push(`Entry ${e.id}: missing userId`)
    if (!e.action) issues.push(`Entry ${e.id}: missing action`)
    if (!e.createdAt) issues.push(`Entry ${e.id}: missing createdAt`)
  }
  return { valid: issues.length === 0, issues }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'entry-1',
    storeId: 'store-1',
    userId: 'user-1',
    action: 'ORDER_CREATE',
    entityType: 'ORDER',
    entityId: 'order-1',
    oldValue: null,
    newValue: null,
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    createdAt: '2025-06-15T10:00:00Z',
    ...overrides,
  }
}

function makeSecurityEvent(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: 'ev-1',
    storeId: 'store-1',
    userId: 'user-1',
    type: 'LOGIN',
    severity: 'LOW',
    description: null,
    createdAt: '2025-06-15T10:00:00Z',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Action categorization', () => {
  it('categorizes LOGIN as auth', () => {
    expect(categorizeAction('LOGIN')).toBe('auth')
  })

  it('categorizes ORDER_CREATE as pos', () => {
    expect(categorizeAction('ORDER_CREATE')).toBe('pos')
  })

  it('categorizes STOCK_ADJUST as inventory', () => {
    expect(categorizeAction('STOCK_ADJUST')).toBe('inventory')
  })

  it('categorizes USER_UPDATE as admin', () => {
    expect(categorizeAction('USER_UPDATE')).toBe('admin')
  })

  it('categorizes unknown action as other', () => {
    expect(categorizeAction('UNKNOWN_CUSTOM_ACTION')).toBe('other')
  })
})

describe('Severity classification', () => {
  it('FAILED_LOGIN is HIGH severity', () => {
    expect(classifyEventSeverity('FAILED_LOGIN')).toBe('HIGH')
  })

  it('VOID_TRANSACTION is HIGH severity', () => {
    expect(classifyEventSeverity('VOID_TRANSACTION')).toBe('HIGH')
  })

  it('DISCOUNT_OVERRIDE is MEDIUM severity', () => {
    expect(classifyEventSeverity('DISCOUNT_OVERRIDE')).toBe('MEDIUM')
  })

  it('LOGIN is LOW severity', () => {
    expect(classifyEventSeverity('LOGIN')).toBe('LOW')
  })
})

describe('Event filtering by date', () => {
  const entries = [
    makeEntry({ id: 'e1', createdAt: '2025-06-01T10:00:00Z' }),
    makeEntry({ id: 'e2', createdAt: '2025-06-15T10:00:00Z' }),
    makeEntry({ id: 'e3', createdAt: '2025-06-30T10:00:00Z' }),
  ]

  it('filters entries after a from date', () => {
    const result = filterEntriesByDate(entries, '2025-06-10')
    expect(result).toHaveLength(2)
    expect(result.map(e => e.id)).toEqual(['e2', 'e3'])
  })

  it('filters entries before a to date', () => {
    const result = filterEntriesByDate(entries, undefined, '2025-06-14')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('e1')
  })

  it('returns all entries when no date filters applied', () => {
    const result = filterEntriesByDate(entries)
    expect(result).toHaveLength(3)
  })
})

describe('Security event counting', () => {
  it('counts events by type correctly', () => {
    const events = [
      makeSecurityEvent({ type: 'LOGIN' }),
      makeSecurityEvent({ id: 'ev-2', type: 'LOGIN' }),
      makeSecurityEvent({ id: 'ev-3', type: 'FAILED_LOGIN' }),
    ]
    const counts = countEventsByType(events)
    expect(counts['LOGIN']).toBe(2)
    expect(counts['FAILED_LOGIN']).toBe(1)
    expect(counts['LOGOUT']).toBeUndefined()
  })
})

describe('Audit trail integrity check', () => {
  it('passes for valid entries', () => {
    const entries = [
      makeEntry({ id: 'a1' }),
      makeEntry({ id: 'a2' }),
    ]
    const result = verifyAuditIntegrity(entries)
    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('detects duplicate ids', () => {
    const entries = [
      makeEntry({ id: 'dup' }),
      makeEntry({ id: 'dup' }),
    ]
    const result = verifyAuditIntegrity(entries)
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.includes('Duplicate id'))).toBe(true)
  })

  it('detects missing required fields', () => {
    const entry = makeEntry({ userId: '' })
    const result = verifyAuditIntegrity([entry])
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.includes('userId'))).toBe(true)
  })
})
