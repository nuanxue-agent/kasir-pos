// UserRole as plain string constants (replaces @prisma/client enum)
export type UserRole = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'CASHIER'

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 4,
  OWNER: 3,
  MANAGER: 2,
  CASHIER: 1,
}

export function canAccess(userRole: string, requiredRole: string): boolean {
  const a = ROLE_HIERARCHY[userRole as UserRole] ?? 0
  const b = ROLE_HIERARCHY[requiredRole as UserRole] ?? 0
  return a >= b
}

export function isAtLeast(userRole: string, role: UserRole): boolean {
  return canAccess(userRole, role)
}

export function isManagerOrAbove(role: string): boolean {
  return isAtLeast(role, 'MANAGER')
}

export function isOwnerOrAbove(role: string): boolean {
  return isAtLeast(role, 'OWNER')
}
