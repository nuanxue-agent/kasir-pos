import { describe, it, expect } from 'vitest'

// ─── Types (mirrors API + component) ─────────────────────────────────────────

type TableShape = 'SQUARE' | 'ROUND' | 'BAR'
type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING'

interface TableLayout {
  id: string
  storeId: string
  tableId: string
  label: string
  x: number
  y: number
  width: number
  height: number
  shape: TableShape
  floor: number
  capacity: number
  status: TableStatus
  mergedInto: string | null
  active: number
}

// ─── Pure logic helpers ───────────────────────────────────────────────────────

function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

function hasPositionConflict(tables: TableLayout[], newX: number, newY: number, newW: number, newH: number, excludeId?: string): boolean {
  return tables
    .filter(t => t.active === 1 && t.id !== excludeId)
    .some(t => rectsOverlap(newX, newY, newW, newH, t.x, t.y, t.width, t.height))
}

function getTotalCapacity(tables: TableLayout[]): number {
  return tables.filter(t => t.active === 1).reduce((sum, t) => sum + t.capacity, 0)
}

function getMergeCapacity(primary: TableLayout, secondary: TableLayout): number {
  return primary.capacity + secondary.capacity
}

function filterByFloor(tables: TableLayout[], floor: number): TableLayout[] {
  return tables.filter(t => t.floor === floor && t.active === 1)
}

const VALID_STATUS_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  AVAILABLE: ['OCCUPIED', 'RESERVED', 'CLEANING'],
  OCCUPIED: ['AVAILABLE', 'CLEANING'],
  RESERVED: ['AVAILABLE', 'OCCUPIED', 'CLEANING'],
  CLEANING: ['AVAILABLE'],
}

function canTransition(from: TableStatus, to: TableStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

function getDefaultCapacity(shape: TableShape): number {
  const map: Record<TableShape, number> = { SQUARE: 4, ROUND: 6, BAR: 2 }
  return map[shape]
}

// ─── Test data ────────────────────────────────────────────────────────────────

function makeTable(overrides: Partial<TableLayout> = {}): TableLayout {
  return {
    id: 'tbl-1',
    storeId: 'store-1',
    tableId: 'table-1',
    label: 'T1',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    shape: 'SQUARE',
    floor: 1,
    capacity: 4,
    status: 'AVAILABLE',
    mergedInto: null,
    active: 1,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Floor Plan — position validation', () => {
  it('detects exact overlap at same position', () => {
    const existing: TableLayout[] = [makeTable({ id: 'a', x: 2, y: 2, width: 1, height: 1 })]
    expect(hasPositionConflict(existing, 2, 2, 1, 1)).toBe(true)
  })

  it('no overlap when tables are adjacent horizontally', () => {
    const existing: TableLayout[] = [makeTable({ id: 'a', x: 0, y: 0, width: 1, height: 1 })]
    expect(hasPositionConflict(existing, 1, 0, 1, 1)).toBe(false)
  })

  it('no overlap when tables are on different rows', () => {
    const existing: TableLayout[] = [makeTable({ id: 'a', x: 0, y: 0, width: 1, height: 1 })]
    expect(hasPositionConflict(existing, 0, 1, 1, 1)).toBe(false)
  })

  it('detects partial overlap with wide table', () => {
    const existing: TableLayout[] = [makeTable({ id: 'a', x: 1, y: 0, width: 3, height: 1 })]
    // New 1×1 at x=2 overlaps the wide table (x:1, w:3 covers 1–3)
    expect(hasPositionConflict(existing, 2, 0, 1, 1)).toBe(true)
  })

  it('excludes self when checking own move', () => {
    const table = makeTable({ id: 'self', x: 2, y: 2, width: 1, height: 1 })
    expect(hasPositionConflict([table], 2, 2, 1, 1, 'self')).toBe(false)
  })
})

describe('Floor Plan — capacity calculation', () => {
  it('sums capacity of all active tables', () => {
    const tables: TableLayout[] = [
      makeTable({ id: 'a', capacity: 4 }),
      makeTable({ id: 'b', capacity: 6 }),
      makeTable({ id: 'c', capacity: 2 }),
    ]
    expect(getTotalCapacity(tables)).toBe(12)
  })

  it('ignores inactive tables', () => {
    const tables: TableLayout[] = [
      makeTable({ id: 'a', capacity: 4, active: 1 }),
      makeTable({ id: 'b', capacity: 6, active: 0 }),
    ]
    expect(getTotalCapacity(tables)).toBe(4)
  })

  it('returns correct default capacity per shape', () => {
    expect(getDefaultCapacity('SQUARE')).toBe(4)
    expect(getDefaultCapacity('ROUND')).toBe(6)
    expect(getDefaultCapacity('BAR')).toBe(2)
  })
})

describe('Floor Plan — status transitions', () => {
  it('AVAILABLE can transition to OCCUPIED', () => {
    expect(canTransition('AVAILABLE', 'OCCUPIED')).toBe(true)
  })

  it('AVAILABLE can transition to RESERVED', () => {
    expect(canTransition('AVAILABLE', 'RESERVED')).toBe(true)
  })

  it('AVAILABLE can transition to CLEANING', () => {
    expect(canTransition('AVAILABLE', 'CLEANING')).toBe(true)
  })

  it('OCCUPIED can transition to AVAILABLE', () => {
    expect(canTransition('OCCUPIED', 'AVAILABLE')).toBe(true)
  })

  it('OCCUPIED cannot transition to RESERVED', () => {
    expect(canTransition('OCCUPIED', 'RESERVED')).toBe(false)
  })

  it('CLEANING can only transition to AVAILABLE', () => {
    expect(canTransition('CLEANING', 'AVAILABLE')).toBe(true)
    expect(canTransition('CLEANING', 'OCCUPIED')).toBe(false)
    expect(canTransition('CLEANING', 'RESERVED')).toBe(false)
  })
})

describe('Floor Plan — floor filter', () => {
  it('returns only tables on the specified floor', () => {
    const tables: TableLayout[] = [
      makeTable({ id: 'a', floor: 1 }),
      makeTable({ id: 'b', floor: 2 }),
      makeTable({ id: 'c', floor: 1 }),
    ]
    const floor1 = filterByFloor(tables, 1)
    expect(floor1).toHaveLength(2)
    expect(floor1.every(t => t.floor === 1)).toBe(true)
  })

  it('returns empty array when no tables on floor', () => {
    const tables: TableLayout[] = [makeTable({ id: 'a', floor: 1 })]
    expect(filterByFloor(tables, 3)).toHaveLength(0)
  })
})

describe('Floor Plan — merge capacity', () => {
  it('merge sums both table capacities', () => {
    const primary = makeTable({ id: 'p', capacity: 4 })
    const secondary = makeTable({ id: 's', capacity: 6 })
    expect(getMergeCapacity(primary, secondary)).toBe(10)
  })

  it('merge of two BAR tables gives correct combined capacity', () => {
    const p = makeTable({ id: 'p', shape: 'BAR', capacity: 2 })
    const s = makeTable({ id: 's', shape: 'BAR', capacity: 2 })
    expect(getMergeCapacity(p, s)).toBe(4)
  })
})
