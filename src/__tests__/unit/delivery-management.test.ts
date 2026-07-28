import { describe, it, expect } from 'vitest'

// ─── Types ─────────────────────────────────────────────────────────────────────

type DeliveryStatus = 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'FAILED'

interface DeliveryOrder {
  id: string
  orderId: string
  storeId: string
  courierId: string | null
  address: string
  status: DeliveryStatus
  estimatedAt: string | null
  deliveredAt: string | null
  notes: string | null
}

interface Courier {
  id: string
  storeId: string
  name: string
  phone: string
  vehicleType: string
  active: boolean
}

// ─── Pure logic (mirrors API / component) ─────────────────────────────────────

const VALID_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ['ASSIGNED', 'FAILED'],
  ASSIGNED: ['PICKED_UP', 'FAILED'],
  PICKED_UP: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: [],
}

function canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

const DELIVERY_ZONES = [
  { label: 'Zone 1', maxKm: 5, fee: 5_000 },
  { label: 'Zone 2', maxKm: 10, fee: 10_000 },
  { label: 'Zone 3', maxKm: 20, fee: 20_000 },
] as const

function calculateDeliveryFee(distanceKm: number): { fee: number; zone: string } {
  for (const zone of DELIVERY_ZONES) {
    if (distanceKm <= zone.maxKm) return { fee: zone.fee, zone: zone.label }
  }
  return { fee: 25_000, zone: 'Luar Zona' }
}

function assignCourier(
  order: DeliveryOrder,
  courier: Courier,
  estimatedMinutes = 45,
): DeliveryOrder | { error: string } {
  if (order.status !== 'PENDING') return { error: 'Only PENDING orders can be assigned a courier' }
  if (!courier.active) return { error: 'Courier is not active' }
  return {
    ...order,
    status: 'ASSIGNED',
    courierId: courier.id,
    estimatedAt: new Date(Date.now() + estimatedMinutes * 60_000).toISOString(),
  }
}

function estimatedMinutesRemaining(estimatedAt: string | null, now = Date.now()): number | null {
  if (!estimatedAt) return null
  return Math.floor((new Date(estimatedAt).getTime() - now) / 60_000)
}

function handleFailedDelivery(
  order: DeliveryOrder,
  reason: string,
): DeliveryOrder | { error: string } {
  const terminal: DeliveryStatus[] = ['DELIVERED', 'FAILED']
  if (terminal.includes(order.status)) {
    return { error: `Cannot mark a ${order.status} order as failed` }
  }
  return { ...order, status: 'FAILED', notes: reason }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// 1–3: Status transition validation
describe('Status transition validation', () => {
  it('allows PENDING → ASSIGNED', () => {
    expect(canTransition('PENDING', 'ASSIGNED')).toBe(true)
  })

  it('allows ASSIGNED → PICKED_UP → DELIVERED', () => {
    expect(canTransition('ASSIGNED', 'PICKED_UP')).toBe(true)
    expect(canTransition('PICKED_UP', 'DELIVERED')).toBe(true)
  })

  it('rejects PENDING → DELIVERED (skipping steps)', () => {
    expect(canTransition('PENDING', 'DELIVERED')).toBe(false)
  })

  it('rejects any transition from DELIVERED (terminal)', () => {
    expect(canTransition('DELIVERED', 'ASSIGNED')).toBe(false)
    expect(canTransition('DELIVERED', 'FAILED')).toBe(false)
  })
})

// 4–6: Fee zone calculation
describe('Delivery fee zone calculation', () => {
  it('charges Rp5.000 for distance ≤ 5 km (Zone 1)', () => {
    expect(calculateDeliveryFee(3)).toEqual({ fee: 5_000, zone: 'Zone 1' })
    expect(calculateDeliveryFee(5)).toEqual({ fee: 5_000, zone: 'Zone 1' })
  })

  it('charges Rp10.000 for 5 < distance ≤ 10 km (Zone 2)', () => {
    expect(calculateDeliveryFee(7)).toEqual({ fee: 10_000, zone: 'Zone 2' })
    expect(calculateDeliveryFee(10)).toEqual({ fee: 10_000, zone: 'Zone 2' })
  })

  it('charges Rp20.000 for 10 < distance ≤ 20 km (Zone 3)', () => {
    expect(calculateDeliveryFee(15)).toEqual({ fee: 20_000, zone: 'Zone 3' })
  })

  it('charges Rp25.000 for distance > 20 km (Luar Zona)', () => {
    expect(calculateDeliveryFee(25)).toEqual({ fee: 25_000, zone: 'Luar Zona' })
  })
})

// 7–9: Courier assignment logic
describe('Courier assignment logic', () => {
  const pendingOrder: DeliveryOrder = {
    id: 'do1',
    orderId: 'ord1',
    storeId: 'store1',
    courierId: null,
    address: 'Jl. Sudirman No. 1',
    status: 'PENDING',
    estimatedAt: null,
    deliveredAt: null,
    notes: null,
  }
  const activeCourier: Courier = {
    id: 'c1',
    storeId: 'store1',
    name: 'Budi',
    phone: '081234567890',
    vehicleType: 'Motor',
    active: true,
  }

  it('assigns an active courier to a PENDING order', () => {
    const result = assignCourier(pendingOrder, activeCourier)
    expect('error' in result).toBe(false)
    const updated = result as DeliveryOrder
    expect(updated.status).toBe('ASSIGNED')
    expect(updated.courierId).toBe('c1')
    expect(updated.estimatedAt).not.toBeNull()
  })

  it('rejects assigning an inactive courier', () => {
    const inactive: Courier = { ...activeCourier, active: false }
    const result = assignCourier(pendingOrder, inactive)
    expect('error' in result).toBe(true)
    expect((result as { error: string }).error).toMatch(/not active/i)
  })

  it('rejects assigning a courier to a non-PENDING order', () => {
    const assigned: DeliveryOrder = { ...pendingOrder, status: 'ASSIGNED' }
    const result = assignCourier(assigned, activeCourier)
    expect('error' in result).toBe(true)
    expect((result as { error: string }).error).toMatch(/PENDING/i)
  })
})

// 10: Estimated delivery time
describe('Estimated delivery time', () => {
  it('returns correct minutes remaining when estimate is in the future', () => {
    const future = new Date(Date.now() + 30 * 60_000).toISOString()
    const mins = estimatedMinutesRemaining(future)
    // Allow ±1 minute tolerance for test execution lag
    expect(mins).toBeGreaterThanOrEqual(29)
    expect(mins).toBeLessThanOrEqual(30)
  })

  it('returns null when estimatedAt is null', () => {
    expect(estimatedMinutesRemaining(null)).toBeNull()
  })
})

// 11–12: Failed delivery handling
describe('Failed delivery handling', () => {
  it('marks an ASSIGNED order as FAILED with a reason note', () => {
    const order: DeliveryOrder = {
      id: 'do2',
      orderId: 'ord2',
      storeId: 'store1',
      courierId: 'c1',
      address: 'Jl. Thamrin No. 5',
      status: 'ASSIGNED',
      estimatedAt: new Date().toISOString(),
      deliveredAt: null,
      notes: null,
    }
    const result = handleFailedDelivery(order, 'Alamat tidak ditemukan')
    expect('error' in result).toBe(false)
    const updated = result as DeliveryOrder
    expect(updated.status).toBe('FAILED')
    expect(updated.notes).toBe('Alamat tidak ditemukan')
  })

  it('rejects marking an already DELIVERED order as failed', () => {
    const order: DeliveryOrder = {
      id: 'do3',
      orderId: 'ord3',
      storeId: 'store1',
      courierId: 'c1',
      address: 'Jl. MH Thamrin No. 10',
      status: 'DELIVERED',
      estimatedAt: null,
      deliveredAt: new Date().toISOString(),
      notes: null,
    }
    const result = handleFailedDelivery(order, 'Late')
    expect('error' in result).toBe(true)
    expect((result as { error: string }).error).toMatch(/DELIVERED/i)
  })
})
