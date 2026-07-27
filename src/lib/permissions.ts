import { UserRole } from '@prisma/client'

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 4,
  OWNER: 3,
  MANAGER: 2,
  CASHIER: 1,
}

export function canAccess(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

export function isAtLeast(userRole: UserRole, role: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[role]
}

export function isOwnerOrAbove(role: UserRole) {
  return isAtLeast(role, UserRole.OWNER)
}

export function isManagerOrAbove(role: UserRole) {
  return isAtLeast(role, UserRole.MANAGER)
}

export function isSuperAdmin(role: UserRole) {
  return role === UserRole.SUPER_ADMIN
}
