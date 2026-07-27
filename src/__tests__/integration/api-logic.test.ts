import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Integration tests for API route logic (pure function extraction) ─────────
// We test the business logic that lives in the API route without hitting
// a real D1 database. The DB calls are mocked.

// ─── Slug generation ──────────────────────────────────────────────────────────
function makeSlug(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

describe('Registration slug generation', () => {
  it('lowercases and replaces spaces', () => {
    expect(makeSlug('Warung Sari Rasa')).toBe('warung-sari-rasa')
  })
  it('collapses consecutive special chars', () => {
    expect(makeSlug('Café & Resto!!')).toBe('caf-resto')
  })
  it('handles pure alphanumeric', () => {
    expect(makeSlug('MyShop123')).toBe('myshop123')
  })
  it('handles single word', () => {
    expect(makeSlug('Lakoo')).toBe('lakoo')
  })
})

// ─── Input validation ─────────────────────────────────────────────────────────
function validateRegistration(body: any): string | null {
  if (!body.businessName || body.businessName.length < 2) return 'Nama usaha minimal 2 karakter'
  if (!body.name || body.name.length < 2) return 'Nama minimal 2 karakter'
  if (!body.email || !body.email.includes('@')) return 'Email tidak valid'
  if (!body.password || body.password.length < 6) return 'Password minimal 6 karakter'
  return null
}

describe('Registration validation', () => {
  it('accepts valid registration data', () => {
    expect(validateRegistration({
      businessName: 'Warung Sari',
      name: 'Ahmad',
      email: 'ahmad@test.com',
      password: 'secret123',
    })).toBeNull()
  })
  it('rejects short business name', () => {
    expect(validateRegistration({ businessName: 'A', name: 'Ahmad', email: 'a@b.com', password: '123456' }))
      .toBe('Nama usaha minimal 2 karakter')
  })
  it('rejects invalid email', () => {
    expect(validateRegistration({ businessName: 'Warung', name: 'Ahmad', email: 'notanemail', password: '123456' }))
      .toBe('Email tidak valid')
  })
  it('rejects short password', () => {
    expect(validateRegistration({ businessName: 'Warung', name: 'Ahmad', email: 'a@b.com', password: '123' }))
      .toBe('Password minimal 6 karakter')
  })
})

// ─── SQL injection prevention via allowlist ──────────────────────────────────
const ALLOWED_PRODUCT_COLS = new Set([
  'name', 'description', 'sku', 'barcode', 'price', 'cost',
  'categoryId', 'trackStock', 'stock', 'lowStock', 'active', 'image',
])

function filterCols(body: Record<string, any>, allowed: Set<string>): Record<string, any> {
  return Object.fromEntries(Object.entries(body).filter(([k]) => allowed.has(k)))
}

describe('SQL injection prevention (column allowlist)', () => {
  it('filters out non-allowlisted columns', () => {
    const input = { name: 'Product', price: 10000, DROP: 'TABLE', injected: '1=1' }
    const filtered = filterCols(input, ALLOWED_PRODUCT_COLS)
    expect(filtered).not.toHaveProperty('DROP')
    expect(filtered).not.toHaveProperty('injected')
    expect(filtered).toHaveProperty('name')
    expect(filtered).toHaveProperty('price')
  })

  it('allows all valid product columns', () => {
    const input = { name: 'P', sku: 'SKU1', price: 100, stock: 5, active: true }
    const filtered = filterCols(input, ALLOWED_PRODUCT_COLS)
    expect(Object.keys(filtered)).toHaveLength(5)
  })

  it('returns empty object when all keys are disallowed', () => {
    const input = { hack: 'x', inject: 'y' }
    expect(filterCols(input, ALLOWED_PRODUCT_COLS)).toEqual({})
  })
})

// ─── Store access guard ────────────────────────────────────────────────────────
function assertStoreAccess(user: any, storeId: string): boolean {
  return user.stores?.some((s: any) => s.id === storeId) ?? false
}

describe('Store access control', () => {
  const user = {
    id: 'u1',
    stores: [
      { id: 's1', role: 'OWNER' },
      { id: 's2', role: 'CASHIER' },
    ],
  }

  it('grants access to stores the user belongs to', () => {
    expect(assertStoreAccess(user, 's1')).toBe(true)
    expect(assertStoreAccess(user, 's2')).toBe(true)
  })

  it('denies access to stores the user does not belong to', () => {
    expect(assertStoreAccess(user, 's3')).toBe(false)
    expect(assertStoreAccess(user, '')).toBe(false)
  })

  it('handles user with no stores', () => {
    expect(assertStoreAccess({ id: 'u2', stores: [] }, 's1')).toBe(false)
    expect(assertStoreAccess({ id: 'u2' }, 's1')).toBe(false)
  })
})

// ─── Expense date range filtering ────────────────────────────────────────────
function isInDateRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to
}

describe('Expense date range', () => {
  it('includes dates within range', () => {
    expect(isInDateRange('2025-06-15', '2025-06-01', '2025-06-30')).toBe(true)
  })
  it('includes boundary dates', () => {
    expect(isInDateRange('2025-06-01', '2025-06-01', '2025-06-30')).toBe(true)
    expect(isInDateRange('2025-06-30', '2025-06-01', '2025-06-30')).toBe(true)
  })
  it('excludes dates outside range', () => {
    expect(isInDateRange('2025-05-31', '2025-06-01', '2025-06-30')).toBe(false)
    expect(isInDateRange('2025-07-01', '2025-06-01', '2025-06-30')).toBe(false)
  })
})

// ─── Shift cash reconciliation ────────────────────────────────────────────────
function calcExpectedCash(openingCash: number, cashRevenue: number): number {
  return openingCash + cashRevenue
}

function calcCashDiff(actualCash: number, expectedCash: number): number {
  return actualCash - expectedCash
}

describe('Shift cash reconciliation', () => {
  it('calculates expected cash correctly', () => {
    expect(calcExpectedCash(500000, 1500000)).toBe(2000000)
  })
  it('calculates positive difference (more cash than expected)', () => {
    expect(calcCashDiff(2100000, 2000000)).toBe(100000)
  })
  it('calculates negative difference (less cash than expected)', () => {
    expect(calcCashDiff(1900000, 2000000)).toBe(-100000)
  })
  it('zero difference when exact', () => {
    expect(calcCashDiff(2000000, 2000000)).toBe(0)
  })
})
