/**
 * @module permissions
 * Role-based access control for the POS/back-office.
 *
 * Role hierarchy (highest → lowest):
 *   SUPER_ADMIN (4) → OWNER (3) → MANAGER (2) → CASHIER (1)
 *
 * Use `canAccess` for generic role checks or the typed helpers
 * (`isManagerOrAbove`, `isOwnerOrAbove`) for the most common gates.
 */
// UserRole as plain string constants (replaces @prisma/client enum)
export type UserRole = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'CASHIER'

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 4,
  OWNER: 3,
  MANAGER: 2,
  CASHIER: 1,
}

/**
 * Return `true` when `userRole` is at or above `requiredRole` in the hierarchy.
 * Unknown roles are treated as rank 0 (no access).
 */
export function canAccess(userRole: string, requiredRole: string): boolean {
  const a = ROLE_HIERARCHY[userRole as UserRole] ?? 0
  const b = ROLE_HIERARCHY[requiredRole as UserRole] ?? 0
  return a >= b
}

/** Typed alias for `canAccess` — prefers `UserRole` values for `role`. */
export function isAtLeast(userRole: string, role: UserRole): boolean {
  return canAccess(userRole, role)
}

/** `true` when the role is MANAGER, OWNER, or SUPER_ADMIN. */
export function isManagerOrAbove(role: string): boolean {
  return isAtLeast(role, 'MANAGER')
}

/** `true` when the role is OWNER or SUPER_ADMIN. */
export function isOwnerOrAbove(role: string): boolean {
  return isAtLeast(role, 'OWNER')
}
