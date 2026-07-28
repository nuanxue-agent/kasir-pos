/**
 * Shared TypeScript interfaces used across 3+ files.
 * Keep this file lean — domain-specific types belong in their own lib modules.
 */

// ── Generic response wrappers ─────────────────────────────────────────────────

/** Standard API route response envelope. */
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

/** Paginated list response returned by list API routes. */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  pages: number
}

// ── Core domain types ─────────────────────────────────────────────────────────

/** A store / outlet record. */
export interface Store {
  id: string
  name: string
  currency: string
  timezone: string
  address?: string | null
  phone?: string | null
  email?: string | null
  logoUrl?: string | null
  createdAt: string
  updatedAt: string
}

/** An authenticated user in the system. */
export interface User {
  id: string
  storeId: string
  name: string
  email: string
  role: 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'CASHIER'
  createdAt: string
  updatedAt: string
}

/** A product (item for sale). */
export interface Product {
  id: string
  storeId: string
  name: string
  sku?: string | null
  barcode?: string | null
  price: number
  cost?: number | null
  stock: number
  categoryId?: string | null
  categoryName?: string | null
  unit?: string | null
  imageUrl?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/** A sales order header. */
export interface Order {
  id: string
  storeId: string
  orderNumber: string
  customerId?: string | null
  userId: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  paymentMethod: string
  status: 'PENDING' | 'COMPLETED' | 'REFUNDED' | 'VOIDED'
  notes?: string | null
  createdAt: string
  updatedAt: string
}

/** A customer / loyalty member. */
export interface Customer {
  id: string
  storeId: string
  name: string
  phone?: string | null
  email?: string | null
  loyaltyPoints: number
  totalSpend: number
  visitCount: number
  tier?: string | null
  referralCode?: string | null
  createdAt: string
  updatedAt: string
}
