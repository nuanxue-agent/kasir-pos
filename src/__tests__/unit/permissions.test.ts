import { describe, it, expect } from 'vitest'

// ── Permissions logic (mirrors src/lib/permissions.ts) ──────────────────────

type UserRole = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'CASHIER'

const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 100,
  OWNER: 80,
  MANAGER: 50,
  CASHIER: 20,
}

function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

function canManageStore(role: UserRole): boolean {
  return hasPermission(role, 'OWNER')
}

function canManageStaff(role: UserRole): boolean {
  return hasPermission(role, 'MANAGER')
}

function canAccessPOS(role: UserRole): boolean {
  return hasPermission(role, 'CASHIER')
}

describe('Role hierarchy', () => {
  it('SUPER_ADMIN has the highest level', () => {
    expect(ROLE_HIERARCHY.SUPER_ADMIN).toBeGreaterThan(ROLE_HIERARCHY.OWNER)
    expect(ROLE_HIERARCHY.SUPER_ADMIN).toBeGreaterThan(ROLE_HIERARCHY.MANAGER)
    expect(ROLE_HIERARCHY.SUPER_ADMIN).toBeGreaterThan(ROLE_HIERARCHY.CASHIER)
  })

  it('OWNER is above MANAGER and CASHIER', () => {
    expect(ROLE_HIERARCHY.OWNER).toBeGreaterThan(ROLE_HIERARCHY.MANAGER)
    expect(ROLE_HIERARCHY.OWNER).toBeGreaterThan(ROLE_HIERARCHY.CASHIER)
  })

  it('MANAGER is above CASHIER only', () => {
    expect(ROLE_HIERARCHY.MANAGER).toBeGreaterThan(ROLE_HIERARCHY.CASHIER)
    expect(ROLE_HIERARCHY.MANAGER).toBeLessThan(ROLE_HIERARCHY.OWNER)
  })
})

describe('canManageStore', () => {
  it('SUPER_ADMIN can manage store', () => expect(canManageStore('SUPER_ADMIN')).toBe(true))
  it('OWNER can manage store', ()       => expect(canManageStore('OWNER')).toBe(true))
  it('MANAGER cannot manage store', () => expect(canManageStore('MANAGER')).toBe(false))
  it('CASHIER cannot manage store', () => expect(canManageStore('CASHIER')).toBe(false))
})

describe('canManageStaff', () => {
  it('SUPER_ADMIN can manage staff', () => expect(canManageStaff('SUPER_ADMIN')).toBe(true))
  it('OWNER can manage staff', ()       => expect(canManageStaff('OWNER')).toBe(true))
  it('MANAGER can manage staff', ()     => expect(canManageStaff('MANAGER')).toBe(true))
  it('CASHIER cannot manage staff', () => expect(canManageStaff('CASHIER')).toBe(false))
})

describe('canAccessPOS', () => {
  it('all roles can access POS', () => {
    const roles: UserRole[] = ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'CASHIER']
    roles.forEach(r => expect(canAccessPOS(r)).toBe(true))
  })
})
