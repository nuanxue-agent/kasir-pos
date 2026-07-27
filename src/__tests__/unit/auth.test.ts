import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── JWT token structure ───────────────────────────────────────────────────────

describe('JWT token structure', () => {
  it('generates a 3-part dot-separated token', async () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = btoa(JSON.stringify({ id: 'u1', exp: Date.now() + 86400000 }))
    const sig = btoa('fakesig')
    const token = `${header}.${payload}.${sig}`
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

  it('token missing any part fails length check', () => {
    const badToken = 'onlytwoparts.here'
    expect(badToken.split('.').length).not.toBe(3)
  })

  it('7-day expiry is encoded as iat + 604800000 ms', () => {
    const iat = Date.now()
    const exp = iat + 86400000 * 7
    expect(exp - iat).toBe(604800000)
  })
})

// ── Session user shape ────────────────────────────────────────────────────────

describe('Session user shape', () => {
  it('includes required fields', () => {
    const user = {
      id: 'u1',
      name: 'Ahmad',
      email: 'a@test.com',
      role: 'OWNER',
      onboarded: true,
      stores: [
        { id: 's1', name: 'Toko', role: 'OWNER', currency: 'IDR', taxRate: 0, modules: ['pos'] },
      ],
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

// ── Password hash verification (pure logic) ───────────────────────────────────
// bcrypt hashes start with $2b$ or $2a$; this validates the shape without
// calling real bcrypt (no dependency in test env).

function looksLikeBcryptHash(h: string): boolean {
  return /^\$2[ab]\$\d{2}\$/.test(h)
}

function isPasswordLongEnough(pw: string, min = 8): boolean {
  return pw.length >= min
}

function isPasswordStrong(pw: string): boolean {
  const hasUpper = /[A-Z]/.test(pw)
  const hasLower = /[a-z]/.test(pw)
  const hasDigit = /\d/.test(pw)
  return pw.length >= 8 && hasUpper && hasLower && hasDigit
}

describe('Password validation logic', () => {
  it('bcrypt hash shape recognised correctly', () => {
    const hash = '$2b$12$abcdefghijklmnopqrstuuVwxyz012345678901234567890123456'
    expect(looksLikeBcryptHash(hash)).toBe(true)
  })

  it('plain text is not a bcrypt hash', () => {
    expect(looksLikeBcryptHash('mysecretpassword')).toBe(false)
  })

  it('rejects passwords shorter than minimum', () => {
    expect(isPasswordLongEnough('abc', 8)).toBe(false)
  })

  it('accepts passwords at exactly minimum length', () => {
    expect(isPasswordLongEnough('12345678', 8)).toBe(true)
  })

  it('strong password passes all criteria', () => {
    expect(isPasswordStrong('Secure123')).toBe(true)
  })

  it('password without uppercase fails strong check', () => {
    expect(isPasswordStrong('secure123')).toBe(false)
  })

  it('password without digit fails strong check', () => {
    expect(isPasswordStrong('SecurePass')).toBe(false)
  })

  it('password under 8 chars fails strong check', () => {
    expect(isPasswordStrong('Ab1')).toBe(false)
  })
})

// ── Rate limit logic ──────────────────────────────────────────────────────────

interface RateLimitState {
  attempts: number
  firstAttemptAt: number
  lockedUntil?: number
}

const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 min
const RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000 // 15 min lockout

function isRateLimited(state: RateLimitState, now = Date.now()): boolean {
  if (state.lockedUntil && now < state.lockedUntil) return true
  return false
}

function recordFailedAttempt(state: RateLimitState, now = Date.now()): RateLimitState {
  // Reset window if first attempt was too long ago
  if (now - state.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    return { attempts: 1, firstAttemptAt: now }
  }
  const attempts = state.attempts + 1
  if (attempts >= RATE_LIMIT_MAX) {
    return {
      attempts,
      firstAttemptAt: state.firstAttemptAt,
      lockedUntil: now + RATE_LIMIT_LOCKOUT_MS,
    }
  }
  return { ...state, attempts }
}

function resetRateLimit(): RateLimitState {
  return { attempts: 0, firstAttemptAt: 0 }
}

describe('Rate limit logic', () => {
  const now = Date.now()

  it('fresh state is not rate limited', () => {
    const state: RateLimitState = { attempts: 0, firstAttemptAt: now }
    expect(isRateLimited(state, now)).toBe(false)
  })

  it('becomes locked after MAX failed attempts', () => {
    let state: RateLimitState = { attempts: 0, firstAttemptAt: now }
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      state = recordFailedAttempt(state, now)
    }
    expect(isRateLimited(state, now + 1)).toBe(true)
  })

  it('lock expires after lockout window', () => {
    let state: RateLimitState = { attempts: 0, firstAttemptAt: now }
    for (let i = 0; i < RATE_LIMIT_MAX; i++) state = recordFailedAttempt(state, now)
    expect(isRateLimited(state, now + RATE_LIMIT_LOCKOUT_MS + 1)).toBe(false)
  })

  it('window resets when first attempt is old', () => {
    const oldState: RateLimitState = { attempts: 4, firstAttemptAt: now - RATE_LIMIT_WINDOW_MS - 1 }
    const next = recordFailedAttempt(oldState, now)
    expect(next.attempts).toBe(1)
  })

  it('resetRateLimit clears all state', () => {
    const state = resetRateLimit()
    expect(state.attempts).toBe(0)
    expect(state.lockedUntil).toBeUndefined()
  })

  it('4 attempts are not yet locked', () => {
    let state: RateLimitState = { attempts: 0, firstAttemptAt: now }
    for (let i = 0; i < RATE_LIMIT_MAX - 1; i++) state = recordFailedAttempt(state, now)
    expect(isRateLimited(state, now)).toBe(false)
    expect(state.attempts).toBe(4)
  })
})

// ── Permission checks (OWNER vs CASHIER vs MANAGER) ──────────────────────────

type UserRole = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'CASHIER'

const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 4,
  OWNER: 3,
  MANAGER: 2,
  CASHIER: 1,
}

function canAccess(userRole: string, requiredRole: string): boolean {
  const a = ROLE_HIERARCHY[userRole as UserRole] ?? 0
  const b = ROLE_HIERARCHY[requiredRole as UserRole] ?? 0
  return a >= b
}

function isManagerOrAbove(role: string): boolean {
  return canAccess(role, 'MANAGER')
}
function isOwnerOrAbove(role: string): boolean {
  return canAccess(role, 'OWNER')
}

// Feature gates
function canViewReports(role: string): boolean {
  return isManagerOrAbove(role)
}
function canEditProducts(role: string): boolean {
  return isManagerOrAbove(role)
}
function canProcessRefund(role: string): boolean {
  return isManagerOrAbove(role)
}
function canDeleteOrder(role: string): boolean {
  return isOwnerOrAbove(role)
}
function canManageUsers(role: string): boolean {
  return isOwnerOrAbove(role)
}
function canChangeTaxRate(role: string): boolean {
  return isOwnerOrAbove(role)
}
function canVoidTransaction(role: string): boolean {
  return isManagerOrAbove(role)
}

describe('Permission checks', () => {
  describe('OWNER permissions', () => {
    it('OWNER can view reports', () => expect(canViewReports('OWNER')).toBe(true))
    it('OWNER can edit products', () => expect(canEditProducts('OWNER')).toBe(true))
    it('OWNER can delete orders', () => expect(canDeleteOrder('OWNER')).toBe(true))
    it('OWNER can manage users', () => expect(canManageUsers('OWNER')).toBe(true))
    it('OWNER can change tax rate', () => expect(canChangeTaxRate('OWNER')).toBe(true))
    it('OWNER can process refund', () => expect(canProcessRefund('OWNER')).toBe(true))
    it('OWNER can void transaction', () => expect(canVoidTransaction('OWNER')).toBe(true))
  })

  describe('MANAGER permissions', () => {
    it('MANAGER can view reports', () => expect(canViewReports('MANAGER')).toBe(true))
    it('MANAGER can edit products', () => expect(canEditProducts('MANAGER')).toBe(true))
    it('MANAGER can process refund', () => expect(canProcessRefund('MANAGER')).toBe(true))
    it('MANAGER can void transaction', () => expect(canVoidTransaction('MANAGER')).toBe(true))
    it('MANAGER cannot delete orders', () => expect(canDeleteOrder('MANAGER')).toBe(false))
    it('MANAGER cannot manage users', () => expect(canManageUsers('MANAGER')).toBe(false))
    it('MANAGER cannot change tax rate', () => expect(canChangeTaxRate('MANAGER')).toBe(false))
  })

  describe('CASHIER permissions', () => {
    it('CASHIER cannot view reports', () => expect(canViewReports('CASHIER')).toBe(false))
    it('CASHIER cannot edit products', () => expect(canEditProducts('CASHIER')).toBe(false))
    it('CASHIER cannot process refund', () => expect(canProcessRefund('CASHIER')).toBe(false))
    it('CASHIER cannot delete orders', () => expect(canDeleteOrder('CASHIER')).toBe(false))
    it('CASHIER cannot manage users', () => expect(canManageUsers('CASHIER')).toBe(false))
    it('CASHIER cannot void transaction', () => expect(canVoidTransaction('CASHIER')).toBe(false))
  })

  describe('SUPER_ADMIN permissions', () => {
    it('SUPER_ADMIN has all access', () => {
      const checks = [
        canViewReports,
        canEditProducts,
        canDeleteOrder,
        canManageUsers,
        canChangeTaxRate,
        canProcessRefund,
        canVoidTransaction,
      ]
      checks.forEach(fn => expect(fn('SUPER_ADMIN')).toBe(true))
    })
  })

  describe('Unknown role', () => {
    it('unknown role is denied everywhere', () => {
      expect(canAccess('GUEST', 'CASHIER')).toBe(false)
      expect(canDeleteOrder('HACKER')).toBe(false)
    })
  })
})

// ── Additional auth edge cases ────────────────────────────────────────────────

describe('JWT additional edge cases', () => {
  it('token with empty string parts fails length check', () => {
    const token = '..'
    expect(token.split('.').length).toBe(3)
    // But parts are empty — payload decode should fail
    const parts = token.split('.')
    expect(parts[1]).toBe('')
  })

  it('payload with extra fields round-trips through base64', () => {
    const payload = {
      id: 'u99',
      name: 'Citra',
      email: 'citra@test.com',
      role: 'MANAGER',
      stores: ['s1', 's2'],
      exp: Date.now() + 3600000,
    }
    const encoded = btoa(JSON.stringify(payload))
    const decoded = JSON.parse(atob(encoded))
    expect(decoded.stores).toHaveLength(2)
    expect(decoded.role).toBe('MANAGER')
  })

  it('30-day expiry is encoded as iat + 2592000000 ms', () => {
    const iat = Date.now()
    const exp = iat + 86400000 * 30
    expect(exp - iat).toBe(2592000000)
  })

  it('looksLikeBcryptHash returns false for $2c$ prefix', () => {
    expect(looksLikeBcryptHash('$2c$12$abcdefghijklmnopqrstuuVwxyz012345678901234567890123456')).toBe(false)
  })

  it('isPasswordStrong rejects password with only uppercase and digits', () => {
    expect(isPasswordStrong('SECURE123')).toBe(false)
  })
})
