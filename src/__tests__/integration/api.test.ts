import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Integration tests for the catch-all API route handler ──────────────────
// We test the business logic extracted from /app/api/[...path]/route.ts
// without a real D1 database. The db module is mocked with an in-memory store.

// ── In-memory SQLite mock ─────────────────────────────────────────────────────

interface Row { [key: string]: any }

class InMemoryDb {
  private tables: Record<string, Row[]> = {
    Product: [],
    'Order': [],
    OrderItem: [],
    Customer: [],
    StockLog: [],
    Category: [],
  }

  private lastInsertId: string | null = null

  query(sql: string, params: any[] = []): Row[] {
    const table = this.extractTable(sql)
    if (!table || !this.tables[table]) return []

    let rows = [...this.tables[table]]

    // Simple WHERE storeId = ? filter
    const storeIdParam = this.extractStoreIdParam(sql, params)
    if (storeIdParam) {
      rows = rows.filter(r => r.storeId === storeIdParam)
    }

    // active=1 filter
    if (sql.includes('active = 1') || sql.includes('active=1')) {
      rows = rows.filter(r => r.active === 1)
    }

    // COUNT(*)
    if (sql.includes('COUNT(*)')) {
      return [{ cnt: rows.length }]
    }

    return rows
  }

  exec(sql: string, params: any[] = []): void {
    if (sql.trim().toUpperCase().startsWith('INSERT INTO')) {
      const table = this.extractInsertTable(sql)
      if (table && this.tables[table] !== undefined) {
        const cols = this.extractInsertCols(sql)
        const row: Row = {}
        cols.forEach((col, i) => { row[col] = params[i] })
        this.tables[table].push(row)
        this.lastInsertId = params[0] ?? null
      }
    } else if (sql.trim().toUpperCase().startsWith('UPDATE')) {
      const table = this.extractUpdateTable(sql)
      if (table && this.tables[table] !== undefined) {
        // Simple updater: just mark rows as updated
        this.tables[table] = this.tables[table].map(r => {
          if (params.includes(r.id)) {
            return { ...r, updated: true }
          }
          return r
        })
      }
    }
  }

  getTable(name: string): Row[] {
    return this.tables[name] ?? []
  }

  private extractTable(sql: string): string | null {
    const m = sql.match(/FROM\s+"?(\w+)"?/i)
    return m ? m[1] : null
  }

  private extractInsertTable(sql: string): string | null {
    const m = sql.match(/INSERT INTO\s+"?(\w+)"?/i)
    return m ? m[1] : null
  }

  private extractUpdateTable(sql: string): string | null {
    const m = sql.match(/UPDATE\s+"?(\w+)"?/i)
    return m ? m[1] : null
  }

  private extractInsertCols(sql: string): string[] {
    const m = sql.match(/\(([^)]+)\)\s+VALUES/i)
    if (!m) return []
    return m[1].split(',').map(c => c.trim())
  }

  private extractStoreIdParam(sql: string, params: any[]): string | null {
    if (sql.includes('storeId = ?') || sql.includes('storeId=?')) {
      return params[0] ?? null
    }
    return null
  }
}

// ── Shared mock DB instance ───────────────────────────────────────────────────

let db: InMemoryDb

vi.mock('@/lib/db', () => ({
  query: vi.fn((...args: any[]) => db.query(args[0], args[1])),
  queryOne: vi.fn((...args: any[]) => db.query(args[0], args[1])[0] ?? null),
  exec: vi.fn((...args: any[]) => db.exec(args[0], args[1])),
  batchExec: vi.fn(),
  newId: vi.fn(() => 'test-id-' + Math.random().toString(36).slice(2, 8)),
  nowISO: vi.fn(() => new Date().toISOString()),
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({
    user: {
      id: 'user-1',
      name: 'Test User',
      email: 'test@test.com',
      role: 'OWNER',
      stores: [{ id: 'store-1', name: 'Test Store', role: 'OWNER', plan: 'PRO', modules: ['pos'] }],
    },
  })),
}))

vi.mock('@/lib/accounting', () => ({ postJournalEntry: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}), getAuditLogs: vi.fn(async () => []) }))
vi.mock('@/lib/gift-cards', () => ({
  generateGiftCardCode: vi.fn(() => 'GC-TEST'),
  deductGiftCardBalance: vi.fn(),
  resolveGiftCardStatus: vi.fn(() => 'ACTIVE'),
}))
vi.mock('@/lib/plan', () => ({
  checkProductLimit: vi.fn(() => true),
  checkStoreLimit: vi.fn(() => true),
}))

// ── Import handler after mocks ─────────────────────────────────────────────────

import { GET, POST, PATCH, DELETE } from '@/app/api/[...path]/route'
import { NextRequest } from 'next/server'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(
  method: string,
  path: string[],
  body?: any,
  query: Record<string, string> = {},
): NextRequest {
  const sp = new URLSearchParams({ storeId: 'store-1', ...query })
  const url = `http://localhost/api/${path.join('/')}?${sp}`
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function makeParams(path: string[]) {
  return { params: Promise.resolve({ path }) }
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  db = new InMemoryDb()
  vi.clearAllMocks()
})

// ─── POST /api/orders creates order correctly ─────────────────────────────────

describe('POST /api/orders', () => {
  it('creates an order and returns 201 with id', async () => {
    const req = makeReq('POST', ['orders'], {
      items: [{ productId: 'p1', name: 'Kopi', qty: 2, price: 15000, subtotal: 30000 }],
      payments: [{ method: 'CASH', amount: 40000 }],
      subtotal: 30000,
      taxAmt: 3000,
      discountAmt: 0,
      total: 33000,
    })
    const res = await POST(req, makeParams(['orders']))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data).toHaveProperty('id')
  })

  it('rejects order with missing items field', async () => {
    const req = makeReq('POST', ['orders'], {
      payments: [{ method: 'CASH', amount: 10000 }],
      subtotal: 0,
      total: 0,
    })
    const res = await POST(req, makeParams(['orders']))
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('rejects order with missing payments field', async () => {
    const req = makeReq('POST', ['orders'], {
      items: [{ productId: 'p1', name: 'Kopi', qty: 1, price: 10000, subtotal: 10000 }],
      subtotal: 10000,
      total: 10000,
    })
    const res = await POST(req, makeParams(['orders']))
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

// ─── GET /api/products returns results ────────────────────────────────────────

describe('GET /api/products', () => {
  beforeEach(() => {
    // Seed products into the in-memory DB
    db['tables']['Product'] = [
      { id: 'prod-1', storeId: 'store-1', name: 'Kopi Arabica', price: 25000, active: 1, stock: 50, trackStock: 1 },
      { id: 'prod-2', storeId: 'store-1', name: 'Teh Manis', price: 10000, active: 1, stock: 100, trackStock: 1 },
      { id: 'prod-3', storeId: 'store-1', name: 'Jus Jeruk', price: 18000, active: 1, stock: 30, trackStock: 1 },
    ]
  })

  it('returns 200 with an array', async () => {
    const req = makeReq('GET', ['products'])
    const res = await GET(req, makeParams(['products']))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  it('returns cached response headers', async () => {
    const req = makeReq('GET', ['products'])
    const res = await GET(req, makeParams(['products']))
    expect(res.status).toBe(200)
    // okCached sets Cache-Control
    const cc = res.headers.get('Cache-Control')
    expect(cc).toBeTruthy()
  })
})

// ─── POST /api/customers creates customer ─────────────────────────────────────

describe('POST /api/customers', () => {
  it('creates a customer and returns 201 with id', async () => {
    const req = makeReq('POST', ['customers'], {
      name: 'Budi Santoso',
      phone: '+6281234567890',
      email: 'budi@test.com',
    })
    const res = await POST(req, makeParams(['customers']))
    expect(res.status).toBe(201)
    const data = await res.json() as { id?: string; name?: string }
    expect(data).toHaveProperty('id')
    expect(data.name).toBe('Budi Santoso')
  })

  it('rejects customer with missing name', async () => {
    const req = makeReq('POST', ['customers'], {
      phone: '+6281234567890',
    })
    const res = await POST(req, makeParams(['customers']))
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

// ─── PATCH /api/products/:id updates stock ────────────────────────────────────

describe('PATCH /api/products/:id', () => {
  it('returns 200 success on valid update', async () => {
    const req = makeReq('PATCH', ['products', 'prod-1'], {
      stock: 75,
      price: 27000,
    })
    const res = await PATCH(req, makeParams(['products', 'prod-1']))
    expect(res.status).toBe(200)
    const data = await res.json() as { success?: boolean }
    expect(data.success).toBe(true)
  })

  it('returns 400 when no valid fields provided', async () => {
    const req = makeReq('PATCH', ['products', 'prod-1'], {
      nonExistentField: 'value',
    })
    const res = await PATCH(req, makeParams(['products', 'prod-1']))
    expect(res.status).toBe(400)
  })

  it('returns 401 when no session', async () => {
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as any)
    const req = makeReq('PATCH', ['products', 'prod-1'], { stock: 10 })
    const res = await PATCH(req, makeParams(['products', 'prod-1']))
    expect(res.status).toBe(401)
  })
})
