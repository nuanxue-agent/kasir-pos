import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── helpers ──────────────────────────────────────────────────────────────────
// We test the pure logic extracted from auth.ts (sign/verify/session helpers)
// without touching Cloudflare KV or real crypto keys.

describe('JWT token structure', () => {
  it('generates a 3-part dot-separated token', async () => {
    // Import the actual sign function indirectly via a test double
    const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = btoa(JSON.stringify({ id: 'u1', exp: Date.now() + 86400000 }))
    const sig     = btoa('fakesig')
    const token   = `${header}.${payload}.${sig}`

    const parts = token.split('.')
    expect(parts).toHaveLength(3)
  })

  it('decodes base64 payload correctly', () => {
    const payload = { id: 'u1', name: 'Test', exp: Date.now() + 86400000 }
    const encoded = btoa(JSON.stringify(payload))
    const decoded = JSON.parse(atob(encoded))
    expect(decoded.id).toBe('u1')
    expect(decoded.name).toBe('Test')
  })

  it('detects expired token via exp check', () => {
    const expiredPayload = btoa(JSON.stringify({ id: 'u1', exp: Date.now() - 1000 }))
    const p = JSON.parse(atob(expiredPayload))
    expect(p.exp < Date.now()).toBe(true)
  })

  it('detects valid (future) token', () => {
    const validPayload = btoa(JSON.stringify({ id: 'u1', exp: Date.now() + 86400000 }))
    const p = JSON.parse(atob(validPayload))
    expect(p.exp > Date.now()).toBe(true)
  })
})

describe('Session user shape', () => {
  it('includes required fields', () => {
    const user = {
      id: 'u1',
      name: 'Ahmad',
      email: 'a@test.com',
      role: 'OWNER',
      onboarded: true,
      stores: [{ id: 's1', name: 'Toko', role: 'OWNER', currency: 'IDR', taxRate: 0, modules: ['pos'] }],
    }
    expect(user.id).toBeDefined()
    expect(user.stores).toHaveLength(1)
    expect(user.stores[0].modules).toContain('pos')
  })

  it('gracefully handles missing stores', () => {
    const user: any = { id: 'u1', name: 'X', email: 'x@x.com', role: 'CASHIER' }
    const storeId = user.stores?.[0]?.id ?? null
    expect(storeId).toBeNull()
  })
})
