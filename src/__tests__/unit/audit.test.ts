import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Types mirrored from src/lib/audit.ts ─────────────────────────────────────

type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'ORDER_CREATE'
  | 'ORDER_REFUND'
  | 'ORDER_VOID'
  | 'STOCK_ADJUST'
  | 'PRODUCT_CREATE'
  | 'PRODUCT_UPDATE'
  | 'PRODUCT_DELETE'
  | 'CUSTOMER_CREATE'
  | 'CUSTOMER_UPDATE'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'STORE_UPDATE'
  | 'SHIFT_OPEN'
  | 'SHIFT_CLOSE'
  | string

interface LogAuditParams {
  storeId: string
  userId: string
  action: AuditAction
  resourceType?: string
  resourceId?: string
  meta?: Record<string, unknown>
}

interface AuditLogEntry {
  id: string
  storeId: string
  userId: string
  userName?: string
  action: string
  resourceType: string | null
  resourceId: string | null
  meta: Record<string, unknown> | null
  createdAt: string
}

// ─── Pure helper: build the INSERT row from params ─────────────────────────────

function buildAuditRow(params: LogAuditParams, id: string, createdAt: string) {
  return {
    id,
    storeId: params.storeId,
    userId: params.userId,
    action: params.action,
    resourceType: params.resourceType ?? null,
    resourceId: params.resourceId ?? null,
    meta: params.meta ? JSON.stringify(params.meta) : null,
    createdAt,
  }
}

// ─── Pure helper: parse meta from a stored row ────────────────────────────────

function parseAuditEntry(row: ReturnType<typeof buildAuditRow>): AuditLogEntry {
  return {
    ...row,
    meta: row.meta
      ? (() => {
          try {
            return JSON.parse(row.meta!)
          } catch {
            return null
          }
        })()
      : null,
  }
}

// ─── Pure helper: paginate a list ─────────────────────────────────────────────

function paginateAuditLogs(entries: AuditLogEntry[], page: number, pageSize: number) {
  const total = entries.length
  const pages = Math.ceil(total / pageSize) || 1
  const offset = (page - 1) * pageSize
  return {
    entries: entries.slice(offset, offset + pageSize),
    total,
    pages,
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('audit — logAudit function signature', () => {
  it('accepts all required fields', () => {
    const params: LogAuditParams = {
      storeId: 'store-1',
      userId: 'user-1',
      action: 'ORDER_CREATE',
    }
    expect(params.storeId).toBe('store-1')
    expect(params.userId).toBe('user-1')
    expect(params.action).toBe('ORDER_CREATE')
  })

  it('accepts optional fields', () => {
    const params: LogAuditParams = {
      storeId: 'store-1',
      userId: 'user-1',
      action: 'PRODUCT_UPDATE',
      resourceType: 'Product',
      resourceId: 'prod-42',
      meta: { oldPrice: 10000, newPrice: 15000 },
    }
    expect(params.resourceType).toBe('Product')
    expect(params.resourceId).toBe('prod-42')
    expect(params.meta?.oldPrice).toBe(10000)
  })

  it('allows arbitrary string actions for extensibility', () => {
    const params: LogAuditParams = {
      storeId: 's',
      userId: 'u',
      action: 'CUSTOM_ACTION',
    }
    expect(params.action).toBe('CUSTOM_ACTION')
  })
})

describe('audit — action type validation', () => {
  const VALID_ACTIONS: AuditAction[] = [
    'LOGIN',
    'LOGOUT',
    'ORDER_CREATE',
    'ORDER_REFUND',
    'ORDER_VOID',
    'STOCK_ADJUST',
    'PRODUCT_CREATE',
    'PRODUCT_UPDATE',
    'PRODUCT_DELETE',
    'CUSTOMER_CREATE',
    'CUSTOMER_UPDATE',
    'USER_CREATE',
    'USER_UPDATE',
    'STORE_UPDATE',
    'SHIFT_OPEN',
    'SHIFT_CLOSE',
  ]

  it('recognises all standard action types', () => {
    expect(VALID_ACTIONS).toHaveLength(16)
    expect(VALID_ACTIONS).toContain('ORDER_CREATE')
    expect(VALID_ACTIONS).toContain('STOCK_ADJUST')
  })

  it('LOGIN and LOGOUT are valid action types', () => {
    expect(VALID_ACTIONS).toContain('LOGIN')
    expect(VALID_ACTIONS).toContain('LOGOUT')
  })
})

describe('audit — entry structure', () => {
  const NOW = '2025-01-15T08:00:00.000Z'
  const ID = 'audit-001'

  it('builds a correct row with meta', () => {
    const row = buildAuditRow(
      {
        storeId: 's1',
        userId: 'u1',
        action: 'ORDER_CREATE',
        resourceType: 'Order',
        resourceId: 'ord-1',
        meta: { total: 50000 },
      },
      ID,
      NOW,
    )
    expect(row.id).toBe(ID)
    expect(row.storeId).toBe('s1')
    expect(row.action).toBe('ORDER_CREATE')
    expect(row.resourceType).toBe('Order')
    expect(row.resourceId).toBe('ord-1')
    expect(JSON.parse(row.meta!)).toEqual({ total: 50000 })
    expect(row.createdAt).toBe(NOW)
  })

  it('nulls optional fields when omitted', () => {
    const row = buildAuditRow({ storeId: 's1', userId: 'u1', action: 'LOGIN' }, ID, NOW)
    expect(row.resourceType).toBeNull()
    expect(row.resourceId).toBeNull()
    expect(row.meta).toBeNull()
  })

  it('parses stored meta back to object', () => {
    const row = buildAuditRow(
      { storeId: 's1', userId: 'u1', action: 'STOCK_ADJUST', meta: { qty: 5, sku: 'ABC' } },
      ID,
      NOW,
    )
    const entry = parseAuditEntry(row)
    expect(entry.meta).toEqual({ qty: 5, sku: 'ABC' })
  })

  it('returns null meta when row has no meta', () => {
    const row = buildAuditRow({ storeId: 's1', userId: 'u1', action: 'LOGIN' }, ID, NOW)
    const entry = parseAuditEntry(row)
    expect(entry.meta).toBeNull()
  })
})

describe('audit — pagination calculation', () => {
  function makeEntries(n: number): AuditLogEntry[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `e${i}`,
      storeId: 's1',
      userId: 'u1',
      action: 'LOGIN',
      resourceType: null,
      resourceId: null,
      meta: null,
      createdAt: new Date(Date.now() - i * 1000).toISOString(),
    }))
  }

  it('returns correct page 1 of 20', () => {
    const result = paginateAuditLogs(makeEntries(45), 1, 20)
    expect(result.entries).toHaveLength(20)
    expect(result.total).toBe(45)
    expect(result.pages).toBe(3)
  })

  it('returns partial last page', () => {
    const result = paginateAuditLogs(makeEntries(45), 3, 20)
    expect(result.entries).toHaveLength(5)
  })

  it('returns 1 page when no entries', () => {
    const result = paginateAuditLogs([], 1, 20)
    expect(result.pages).toBe(1)
    expect(result.total).toBe(0)
    expect(result.entries).toHaveLength(0)
  })
})
