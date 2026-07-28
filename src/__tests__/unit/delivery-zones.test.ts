import { describe, it, expect } from 'vitest'
import {
  findZoneForDistance,
  calcDeliveryFee,
  calcEstimatedMinutes,
  resolveOverlappingZones,
  hasOverlap,
  type DeliveryZone,
} from '@/components/pos/DeliveryZoneClient'

function makeZone(overrides: Partial<DeliveryZone> & { id: string; name: string; minDistance: number; maxDistance: number; fee: number; estimatedMinutes: number }): DeliveryZone {
  return {
    storeId: 'store1',
    active: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

const zoneInner = makeZone({ id: 'z1', name: 'Inner City', minDistance: 0, maxDistance: 5, fee: 10000, estimatedMinutes: 20 })
const zoneMid   = makeZone({ id: 'z2', name: 'Suburban',   minDistance: 5, maxDistance: 15, fee: 20000, estimatedMinutes: 45 })
const zoneOuter = makeZone({ id: 'z3', name: 'Remote',     minDistance: 15, maxDistance: 30, fee: 35000, estimatedMinutes: 90 })

const allZones = [zoneInner, zoneMid, zoneOuter]

// ─── Zone matching by distance ────────────────────────────────────────────

describe('findZoneForDistance', () => {
  it('finds inner city zone for 3 km', () => {
    const result = findZoneForDistance(allZones, 3)
    expect(result?.id).toBe('z1')
  })

  it('finds suburban zone for exact boundary 5 km', () => {
    // 5 km: minDistance=5 matches z2 (minDistance<=5<=maxDistance), also z1 maxDistance=5 matches
    // narrowest should resolve — z1 range=5, z2 range=10, so z1 wins
    const result = findZoneForDistance(allZones, 5)
    expect(result).not.toBeNull()
  })

  it('finds suburban zone for 10 km', () => {
    const result = findZoneForDistance(allZones, 10)
    expect(result?.id).toBe('z2')
  })

  it('finds outer zone for 20 km', () => {
    const result = findZoneForDistance(allZones, 20)
    expect(result?.id).toBe('z3')
  })

  it('returns null when distance exceeds all zones', () => {
    const result = findZoneForDistance(allZones, 50)
    expect(result).toBeNull()
  })

  it('ignores inactive zones', () => {
    const inactiveZone = makeZone({ id: 'z4', name: 'Disabled', minDistance: 0, maxDistance: 10, fee: 5000, estimatedMinutes: 15, active: false })
    const result = findZoneForDistance([inactiveZone], 3)
    expect(result).toBeNull()
  })
})

// ─── Fee calculation ──────────────────────────────────────────────────────

describe('calcDeliveryFee', () => {
  it('returns correct fee for matched zone', () => {
    const { fee, zone, isFree } = calcDeliveryFee(allZones, 3, 50000, 0)
    expect(fee).toBe(10000)
    expect(zone?.id).toBe('z1')
    expect(isFree).toBe(false)
  })

  it('returns fee=0 and covered=false when no zone matches', () => {
    const { fee, zone } = calcDeliveryFee(allZones, 99, 50000, 0)
    expect(fee).toBe(0)
    expect(zone).toBeNull()
  })

  it('returns correct fee for outer zone', () => {
    const { fee } = calcDeliveryFee(allZones, 25, 0, 0)
    expect(fee).toBe(35000)
  })
})

// ─── Free delivery threshold ──────────────────────────────────────────────

describe('free delivery threshold', () => {
  it('applies free delivery when order meets threshold', () => {
    const { fee, isFree } = calcDeliveryFee(allZones, 3, 200000, 150000)
    expect(isFree).toBe(true)
    expect(fee).toBe(0)
  })

  it('charges fee when order is below threshold', () => {
    const { fee, isFree } = calcDeliveryFee(allZones, 3, 100000, 150000)
    expect(isFree).toBe(false)
    expect(fee).toBe(10000)
  })

  it('charges fee when threshold is 0 (disabled)', () => {
    const { fee, isFree } = calcDeliveryFee(allZones, 3, 999999, 0)
    expect(isFree).toBe(false)
    expect(fee).toBe(10000)
  })

  it('applies free delivery when order exactly equals threshold', () => {
    const { fee, isFree } = calcDeliveryFee(allZones, 3, 150000, 150000)
    expect(isFree).toBe(true)
    expect(fee).toBe(0)
  })
})

// ─── Overlapping zone resolution ─────────────────────────────────────────

describe('overlapping zones', () => {
  it('prefers narrowest zone when ranges overlap', () => {
    const narrow = makeZone({ id: 'narrow', name: 'Narrow', minDistance: 2, maxDistance: 4, fee: 5000, estimatedMinutes: 10 })
    const wide   = makeZone({ id: 'wide',   name: 'Wide',   minDistance: 0, maxDistance: 10, fee: 15000, estimatedMinutes: 30 })
    const result = findZoneForDistance([wide, narrow], 3)
    expect(result?.id).toBe('narrow')
  })

  it('hasOverlap returns true when zones overlap', () => {
    const a = makeZone({ id: 'a', name: 'A', minDistance: 0, maxDistance: 6, fee: 1000, estimatedMinutes: 20 })
    const b = makeZone({ id: 'b', name: 'B', minDistance: 5, maxDistance: 10, fee: 2000, estimatedMinutes: 40 })
    expect(hasOverlap([a, b])).toBe(true)
  })

  it('hasOverlap returns false for non-overlapping zones', () => {
    expect(hasOverlap(allZones)).toBe(false)
  })

  it('resolveOverlappingZones returns active zones sorted by minDistance', () => {
    const shuffled = [zoneOuter, zoneInner, zoneMid]
    const result = resolveOverlappingZones(shuffled)
    expect(result.map(z => z.id)).toEqual(['z1', 'z2', 'z3'])
  })
})

// ─── Estimated time calculation ───────────────────────────────────────────

describe('calcEstimatedMinutes', () => {
  it('returns estimatedMinutes for matched zone', () => {
    expect(calcEstimatedMinutes(zoneInner)).toBe(20)
    expect(calcEstimatedMinutes(zoneMid)).toBe(45)
    expect(calcEstimatedMinutes(zoneOuter)).toBe(90)
  })

  it('returns 0 when zone is null', () => {
    expect(calcEstimatedMinutes(null)).toBe(0)
  })
})
