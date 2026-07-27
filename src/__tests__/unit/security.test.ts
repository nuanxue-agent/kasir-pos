import { describe, it, expect } from 'vitest'

// ── Multi-tenant security logic ───────────────────────────────────────────────
// These tests verify the tenant isolation rules that every API route must follow.

interface Store { id: string; name: string }
interface SessionUser {
  id: string
  email: string
  role: string
  stores: Store[]
  isSuperAdmin?: boolean
}

function assertStoreAccess(user: SessionUser, storeId: string): boolean {
  if (!storeId) return false
  if (user.isSuperAdmin) return true
  return user.stores?.some(s => s.id === storeId) ?? false
}

function resolveStoreId(user: SessionUser, requestedId: string | null): string | null {
  const id = requestedId ?? user.stores?.[0]?.id ?? null
  if (!id) return null
  if (!assertStoreAccess(user, id)) return null
  return id
}

function sanitizeStoreId(id: string): boolean {
  // storeId must be alphanumeric + hyphens only (UUID format)
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Store access assertion', () => {
  const user: SessionUser = {
    id: 'u1', email: 'owner@test.com', role: 'OWNER',
    stores: [{ id: 'store-A', name: 'Toko A' }, { id: 'store-B', name: 'Toko B' }],
  }

  it('allows access to own stores', () => {
    expect(assertStoreAccess(user, 'store-A')).toBe(true)
    expect(assertStoreAccess(user, 'store-B')).toBe(true)
  })

  it('denies access to other stores', () => {
    expect(assertStoreAccess(user, 'store-C')).toBe(false)
    expect(assertStoreAccess(user, 'store-EVIL')).toBe(false)
  })

  it('denies access when storeId is empty', () => {
    expect(assertStoreAccess(user, '')).toBe(false)
  })

  it('superAdmin can access any store', () => {
    const admin: SessionUser = { ...user, isSuperAdmin: true, stores: [] }
    expect(assertStoreAccess(admin, 'store-ANY')).toBe(true)
    expect(assertStoreAccess(admin, 'store-C')).toBe(true)
  })

  it('user with no stores cannot access anything', () => {
    const noStores: SessionUser = { ...user, stores: [] }
    expect(assertStoreAccess(noStores, 'store-A')).toBe(false)
  })
})

describe('storeId resolution', () => {
  const user: SessionUser = {
    id: 'u1', email: 'owner@test.com', role: 'OWNER',
    stores: [{ id: 'store-A', name: 'Toko A' }],
  }

  it('resolves from request param when valid', () => {
    expect(resolveStoreId(user, 'store-A')).toBe('store-A')
  })

  it('falls back to first store when no param', () => {
    expect(resolveStoreId(user, null)).toBe('store-A')
  })

  it('returns null for unauthorized store', () => {
    expect(resolveStoreId(user, 'store-EVIL')).toBeNull()
  })

  it('returns null when user has no stores and no param', () => {
    const noStores: SessionUser = { ...user, stores: [] }
    expect(resolveStoreId(noStores, null)).toBeNull()
  })

  it('returns null when storeId param is provided but unauthorized', () => {
    expect(resolveStoreId(user, 'store-X')).toBeNull()
  })
})

describe('storeId sanitization', () => {
  it('accepts valid UUID-style IDs', () => {
    expect(sanitizeStoreId('abc123')).toBe(true)
    expect(sanitizeStoreId('store-123-abc')).toBe(true)
    expect(sanitizeStoreId('clxyz_123')).toBe(true)
  })

  it('rejects SQL injection attempts', () => {
    expect(sanitizeStoreId("' OR 1=1 --")).toBe(false)
    expect(sanitizeStoreId('store; DROP TABLE Store;')).toBe(false)
    expect(sanitizeStoreId('../../../etc/passwd')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(sanitizeStoreId('')).toBe(false)
  })

  it('rejects overly long IDs', () => {
    expect(sanitizeStoreId('a'.repeat(65))).toBe(false)
  })
})

describe('Cross-tenant data isolation rules', () => {
  const userA: SessionUser = {
    id: 'u1', email: 'a@test.com', role: 'OWNER',
    stores: [{ id: 'store-A', name: 'Toko A' }],
  }
  const userB: SessionUser = {
    id: 'u2', email: 'b@test.com', role: 'OWNER',
    stores: [{ id: 'store-B', name: 'Toko B' }],
  }

  it('user A cannot access store B', () => {
    expect(assertStoreAccess(userA, 'store-B')).toBe(false)
  })

  it('user B cannot access store A', () => {
    expect(assertStoreAccess(userB, 'store-A')).toBe(false)
  })

  it('resolveStoreId returns null when user B tries store A', () => {
    expect(resolveStoreId(userB, 'store-A')).toBeNull()
  })

  it('resolveStoreId returns null when user A tries store B', () => {
    expect(resolveStoreId(userA, 'store-B')).toBeNull()
  })

  it('each user can only resolve their own store', () => {
    expect(resolveStoreId(userA, null)).toBe('store-A')
    expect(resolveStoreId(userB, null)).toBe('store-B')
  })
})

describe('Role-based access within a store', () => {
  function canAccess(role: string, resource: string, action: string): boolean {
    const READ_ONLY = ['CASHIER']
    const MANAGER_ONLY = ['staff', 'reports', 'expenses', 'shifts']
    const OWNER_ONLY = ['stores', 'billing', 'accounting']

    if (OWNER_ONLY.includes(resource)) return role === 'OWNER' || role === 'SUPER_ADMIN'
    if (MANAGER_ONLY.includes(resource)) return ['MANAGER', 'OWNER', 'SUPER_ADMIN'].includes(role)
    if (READ_ONLY.includes(role) && action !== 'GET') return false
    return true
  }

  it('CASHIER can read products', () => {
    expect(canAccess('CASHIER', 'products', 'GET')).toBe(true)
  })

  it('CASHIER cannot modify products', () => {
    expect(canAccess('CASHIER', 'products', 'POST')).toBe(false)
    expect(canAccess('CASHIER', 'products', 'DELETE')).toBe(false)
  })

  it('CASHIER cannot access reports', () => {
    expect(canAccess('CASHIER', 'reports', 'GET')).toBe(false)
  })

  it('MANAGER can access reports', () => {
    expect(canAccess('MANAGER', 'reports', 'GET')).toBe(true)
  })

  it('MANAGER cannot access billing', () => {
    expect(canAccess('MANAGER', 'billing', 'GET')).toBe(false)
  })

  it('OWNER can access everything', () => {
    expect(canAccess('OWNER', 'billing', 'GET')).toBe(true)
    expect(canAccess('OWNER', 'accounting', 'POST')).toBe(true)
    expect(canAccess('OWNER', 'stores', 'DELETE')).toBe(true)
  })
})
