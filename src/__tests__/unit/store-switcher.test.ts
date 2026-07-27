import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Types mirroring the app's session shape ───────────────────────────────────

interface StoreAccess {
  id: string
  name: string
  role: string
  currency: string
  taxRate: number
  modules?: string[]
}

interface SessionUser {
  id: string
  name: string
  email: string
  role: string
  stores: StoreAccess[]
  activeStoreId?: string
}

// ── Pure helpers extracted from the API route logic ───────────────────────────

/** Returns the store if the user has access, otherwise null */
function resolveStoreAccess(user: SessionUser, storeId: string): StoreAccess | null {
  return user.stores.find(s => s.id === storeId) ?? null
}

/** Derives the active store from the session, falling back to first store */
function getActiveStore(user: SessionUser): StoreAccess | null {
  if (!user.stores.length) return null
  if (user.activeStoreId) {
    const found = user.stores.find(s => s.id === user.activeStoreId)
    if (found) return found
  }
  return user.stores[0]
}

/** Returns updated session user with new activeStoreId */
function switchStore(user: SessionUser, storeId: string): SessionUser | null {
  const target = resolveStoreAccess(user, storeId)
  if (!target) return null
  return { ...user, activeStoreId: storeId }
}

/** Whether the store switcher UI should be visible (only when user has >1 store) */
function shouldShowSwitcher(stores: StoreAccess[]): boolean {
  return stores.length > 1
}

/** Build the PATCH /api/session/store request body */
function buildSwitchPayload(storeId: string): { storeId: string } {
  return { storeId }
}

// ── Test data ─────────────────────────────────────────────────────────────────

const store1: StoreAccess = {
  id: 's1',
  name: 'Toko Utama',
  role: 'OWNER',
  currency: 'IDR',
  taxRate: 11,
  modules: ['pos', 'inventory'],
}

const store2: StoreAccess = {
  id: 's2',
  name: 'Cabang Jakarta',
  role: 'MANAGER',
  currency: 'IDR',
  taxRate: 11,
  modules: ['pos'],
}

const store3: StoreAccess = {
  id: 's3',
  name: 'Cabang Bandung',
  role: 'CASHIER',
  currency: 'IDR',
  taxRate: 11,
  modules: ['pos'],
}

const multiStoreUser: SessionUser = {
  id: 'u1',
  name: 'Budi',
  email: 'budi@toko.id',
  role: 'OWNER',
  stores: [store1, store2, store3],
}

const singleStoreUser: SessionUser = {
  id: 'u2',
  name: 'Sari',
  email: 'sari@toko.id',
  role: 'CASHIER',
  stores: [store1],
}

// ── Store access validation ───────────────────────────────────────────────────

describe('Store access validation', () => {
  it('grants access when storeId is in user.stores', () => {
    const result = resolveStoreAccess(multiStoreUser, 's2')
    expect(result).not.toBeNull()
    expect(result?.id).toBe('s2')
  })

  it('denies access for a storeId not in user.stores', () => {
    const result = resolveStoreAccess(multiStoreUser, 'unknown-store')
    expect(result).toBeNull()
  })

  it('returns the full StoreAccess object with name and currency', () => {
    const result = resolveStoreAccess(multiStoreUser, 's1')
    expect(result?.name).toBe('Toko Utama')
    expect(result?.currency).toBe('IDR')
  })

  it('single-store user is denied access to a foreign store', () => {
    const result = resolveStoreAccess(singleStoreUser, 's2')
    expect(result).toBeNull()
  })
})

// ── Active store selection ────────────────────────────────────────────────────

describe('Active store selection', () => {
  it('returns first store when no activeStoreId is set', () => {
    const active = getActiveStore(multiStoreUser)
    expect(active?.id).toBe('s1')
  })

  it('returns the store matching activeStoreId when set', () => {
    const user: SessionUser = { ...multiStoreUser, activeStoreId: 's2' }
    const active = getActiveStore(user)
    expect(active?.id).toBe('s2')
  })

  it('falls back to first store if activeStoreId no longer valid', () => {
    const user: SessionUser = { ...multiStoreUser, activeStoreId: 'deleted-store' }
    const active = getActiveStore(user)
    expect(active?.id).toBe('s1')
  })

  it('returns null when user has no stores', () => {
    const user: SessionUser = { ...multiStoreUser, stores: [] }
    const active = getActiveStore(user)
    expect(active).toBeNull()
  })
})

// ── Session update logic ──────────────────────────────────────────────────────

describe('Session update logic', () => {
  it('switchStore updates activeStoreId to the new store', () => {
    const updated = switchStore(multiStoreUser, 's3')
    expect(updated?.activeStoreId).toBe('s3')
  })

  it('switchStore returns null for an inaccessible store', () => {
    const updated = switchStore(multiStoreUser, 'not-mine')
    expect(updated).toBeNull()
  })

  it('switchStore preserves all other user fields', () => {
    const updated = switchStore(multiStoreUser, 's2')
    expect(updated?.id).toBe(multiStoreUser.id)
    expect(updated?.name).toBe(multiStoreUser.name)
    expect(updated?.stores).toHaveLength(3)
  })

  it('buildSwitchPayload produces correct JSON body', () => {
    const payload = buildSwitchPayload('s2')
    expect(payload).toEqual({ storeId: 's2' })
  })
})

// ── Single-store hides switcher ───────────────────────────────────────────────

describe('Store switcher visibility', () => {
  it('hides switcher when user has only one store', () => {
    expect(shouldShowSwitcher(singleStoreUser.stores)).toBe(false)
  })

  it('shows switcher when user has two or more stores', () => {
    expect(shouldShowSwitcher(multiStoreUser.stores)).toBe(true)
  })

  it('hides switcher when stores array is empty', () => {
    expect(shouldShowSwitcher([])).toBe(false)
  })
})
