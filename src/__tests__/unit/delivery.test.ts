import { describe, it, expect } from 'vitest'

// ── Types ──────────────────────────────────────────────────────────────────────

type DeliveryStatus = 'PENDING' | 'PREPARING' | 'ON_DELIVERY' | 'DELIVERED' | 'CANCELLED'

interface DeliveryOrder {
  id: string
  storeId: string
  orderId: string | null
  customerId: string | null
  customerName: string | null
  address: string
  status: DeliveryStatus
  driverId: string | null
  driverName: string | null
  estimatedMinutes: number | null
  distanceKm: number | null
  total: number
  createdAt: string
}

interface Employee {
  id: string
  name: string
  role: string
  phone: string | null
}

// ── Business logic (mirrors API + client behaviour) ────────────────────────────

const STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ['PREPARING', 'CANCELLED'],
  PREPARING: ['ON_DELIVERY', 'CANCELLED'],
  ON_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
}

function canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to)
}

function transitionDelivery(
  order: DeliveryOrder,
  to: DeliveryStatus,
): { ok: boolean; order?: DeliveryOrder; error?: string } {
  if (!canTransition(order.status, to)) {
    return {
      ok: false,
      error: `Tidak bisa mengubah status dari ${order.status} ke ${to}`,
    }
  }
  return { ok: true, order: { ...order, status: to } }
}

/**
 * ETA in minutes based on distance (km) and assumed average speed.
 * Base: 3 km → 15 min at 12 km/h. Min 5 min, max 120 min.
 */
function calcETA(distanceKm: number, avgSpeedKmh = 20): number {
  const raw = Math.round((distanceKm / avgSpeedKmh) * 60)
  return Math.min(120, Math.max(5, raw))
}

function assignDriver(
  order: DeliveryOrder,
  driver: Employee,
): { ok: boolean; order?: DeliveryOrder; error?: string } {
  if (driver.role !== 'DRIVER') {
    return { ok: false, error: `Karyawan ${driver.name} bukan DRIVER` }
  }
  if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
    return {
      ok: false,
      error: `Tidak bisa assign driver pada order berstatus ${order.status}`,
    }
  }
  return {
    ok: true,
    order: { ...order, driverId: driver.id, driverName: driver.name },
  }
}

function validateAddress(address: string): { valid: boolean; error?: string } {
  if (!address || typeof address !== 'string') {
    return { valid: false, error: 'Alamat wajib diisi' }
  }
  const trimmed = address.trim()
  if (trimmed.length < 10) {
    return { valid: false, error: 'Alamat terlalu pendek (minimal 10 karakter)' }
  }
  if (trimmed.length > 500) {
    return { valid: false, error: 'Alamat terlalu panjang (maksimal 500 karakter)' }
  }
  return { valid: true }
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const baseOrder: DeliveryOrder = {
  id: 'do-1',
  storeId: 'store-1',
  orderId: 'ord-1',
  customerId: 'cust-1',
  customerName: 'Budi Santoso',
  address: 'Jl. Sudirman No. 45, Jakarta Selatan',
  status: 'PENDING',
  driverId: null,
  driverName: null,
  estimatedMinutes: null,
  distanceKm: 5,
  total: 85_000,
  createdAt: '2025-07-01T10:00:00Z',
}

const driver: Employee = {
  id: 'emp-1',
  name: 'Agus Driver',
  role: 'DRIVER',
  phone: '0812-3456-7890',
}

const cashier: Employee = {
  id: 'emp-2',
  name: 'Siti Kasir',
  role: 'CASHIER',
  phone: null,
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Delivery status transition validation', () => {
  it('PENDING → PREPARING is valid', () => {
    expect(canTransition('PENDING', 'PREPARING')).toBe(true)
  })

  it('PREPARING → ON_DELIVERY is valid', () => {
    expect(canTransition('PREPARING', 'ON_DELIVERY')).toBe(true)
  })

  it('ON_DELIVERY → DELIVERED is valid', () => {
    expect(canTransition('ON_DELIVERY', 'DELIVERED')).toBe(true)
  })

  it('any active status → CANCELLED is valid', () => {
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true)
    expect(canTransition('PREPARING', 'CANCELLED')).toBe(true)
    expect(canTransition('ON_DELIVERY', 'CANCELLED')).toBe(true)
  })

  it('DELIVERED is a terminal state — no further transitions', () => {
    expect(canTransition('DELIVERED', 'PENDING')).toBe(false)
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false)
  })

  it('CANCELLED is a terminal state — no further transitions', () => {
    expect(canTransition('CANCELLED', 'PENDING')).toBe(false)
    expect(canTransition('CANCELLED', 'ON_DELIVERY')).toBe(false)
  })

  it('transitionDelivery returns error message for invalid transition', () => {
    const order = { ...baseOrder, status: 'DELIVERED' as DeliveryStatus }
    const result = transitionDelivery(order, 'PENDING')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('DELIVERED')
  })

  it('transitionDelivery returns updated order on valid transition', () => {
    const result = transitionDelivery(baseOrder, 'PREPARING')
    expect(result.ok).toBe(true)
    expect(result.order?.status).toBe('PREPARING')
  })
})

describe('ETA calculation', () => {
  it('calculates ETA for a short distance', () => {
    // 3 km @ 20 km/h = 9 min → max(5, 9) = 9
    expect(calcETA(3)).toBe(9)
  })

  it('calculates ETA for a medium distance', () => {
    // 10 km @ 20 km/h = 30 min
    expect(calcETA(10)).toBe(30)
  })

  it('clamps ETA to minimum 5 minutes for very short distances', () => {
    expect(calcETA(0.5)).toBe(5) // 1.5 min → clamped to 5
  })

  it('clamps ETA to maximum 120 minutes for very long distances', () => {
    expect(calcETA(100)).toBe(120) // 300 min → clamped to 120
  })
})

describe('Driver assignment logic', () => {
  it('assigns a DRIVER role employee successfully', () => {
    const result = assignDriver(baseOrder, driver)
    expect(result.ok).toBe(true)
    expect(result.order?.driverId).toBe(driver.id)
    expect(result.order?.driverName).toBe(driver.name)
  })

  it('rejects assignment of non-DRIVER employee', () => {
    const result = assignDriver(baseOrder, cashier)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('bukan DRIVER')
  })

  it('rejects driver assignment on a DELIVERED order', () => {
    const order = { ...baseOrder, status: 'DELIVERED' as DeliveryStatus }
    const result = assignDriver(order, driver)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('DELIVERED')
  })

  it('rejects driver assignment on a CANCELLED order', () => {
    const order = { ...baseOrder, status: 'CANCELLED' as DeliveryStatus }
    const result = assignDriver(order, driver)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('CANCELLED')
  })
})

describe('Address validation', () => {
  it('accepts a valid address', () => {
    const result = validateAddress('Jl. Sudirman No. 45, Jakarta Selatan')
    expect(result.valid).toBe(true)
  })

  it('rejects an empty address', () => {
    const result = validateAddress('')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('wajib')
  })

  it('rejects an address shorter than 10 characters', () => {
    const result = validateAddress('Jl. A')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('pendek')
  })

  it('rejects an address longer than 500 characters', () => {
    const long = 'A'.repeat(501)
    const result = validateAddress(long)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('panjang')
  })
})
