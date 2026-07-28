import { describe, it, expect } from 'vitest'
import { formatTableNumber } from '@/components/pos/TableMapClient'

// ─── Types ────────────────────────────────────────────────────────────────────

type TableShape = 'ROUND' | 'SQUARE' | 'RECTANGLE'
type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING'

interface RestaurantTable {
  id: string
  storeId: string
  number: number
  shape: TableShape
  seats: number
  x: number
  y: number
  status: TableStatus
  currentOrderId: string | null
  currentOrderTotal?: number | null
}

interface Order {
  id: string
  storeId: string
  tableId: string | null
  tableNumber: number | null
  total: number
  status: 'PAID' | 'PENDING' | 'VOIDED'
}

// ─── Business logic helpers ───────────────────────────────────────────────────

function occupyTable(table: RestaurantTable, orderId: string): RestaurantTable {
  if (table.status !== 'AVAILABLE')
    throw new Error(`Cannot occupy table with status ${table.status}`)
  return { ...table, status: 'OCCUPIED', currentOrderId: orderId }
}

function releaseTable(table: RestaurantTable): RestaurantTable {
  return { ...table, status: 'AVAILABLE', currentOrderId: null, currentOrderTotal: null }
}

function reserveTable(table: RestaurantTable): RestaurantTable {
  if (table.status !== 'AVAILABLE')
    throw new Error(`Cannot reserve table with status ${table.status}`)
  return { ...table, status: 'RESERVED' }
}

function markCleaning(table: RestaurantTable): RestaurantTable {
  return { ...table, status: 'CLEANING' }
}

function assignTableToOrder(order: Order, table: RestaurantTable): Order {
  return { ...order, tableId: table.id, tableNumber: table.number }
}

function isTableAvailable(table: RestaurantTable): boolean {
  return table.status === 'AVAILABLE'
}

function tableLabel(tableNumber: number | null): string {
  if (tableNumber === null) return ''
  return `Meja ${formatTableNumber(tableNumber)}`
}

function validateSeats(seats: number): boolean {
  return Number.isInteger(seats) && seats >= 1 && seats <= 20
}

function validatePosition(x: number, y: number, cols = 12, rows = 20): boolean {
  return (
    Number.isInteger(x) && Number.isInteger(y) &&
    x >= 0 && y >= 0 &&
    x < cols && y < rows
  )
}

function calculateOccupancyRate(tables: RestaurantTable[]): number {
  if (tables.length === 0) return 0
  const occupied = tables.filter(t => t.status === 'OCCUPIED').length
  return Math.round((occupied / tables.length) * 100)
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeTable = (overrides: Partial<RestaurantTable> = {}): RestaurantTable => ({
  id: 'tbl-1',
  storeId: 'store-1',
  number: 1,
  shape: 'SQUARE',
  seats: 4,
  x: 0,
  y: 0,
  status: 'AVAILABLE',
  currentOrderId: null,
  ...overrides,
})

// ─── 1. Table status transitions ──────────────────────────────────────────────

describe('Table status transitions', () => {
  it('transitions AVAILABLE → OCCUPIED when order is assigned', () => {
    const table = makeTable()
    const occupied = occupyTable(table, 'order-abc')
    expect(occupied.status).toBe('OCCUPIED')
    expect(occupied.currentOrderId).toBe('order-abc')
  })

  it('transitions OCCUPIED → AVAILABLE when order is released', () => {
    const table = makeTable()
    const occupied = occupyTable(table, 'order-abc')
    const released = releaseTable(occupied)
    expect(released.status).toBe('AVAILABLE')
    expect(released.currentOrderId).toBeNull()
  })

  it('throws when trying to occupy an already OCCUPIED table', () => {
    const table = makeTable()
    const occupied = occupyTable(table, 'order-1')
    expect(() => occupyTable(occupied, 'order-2')).toThrow()
  })

  it('transitions AVAILABLE → RESERVED', () => {
    const table = makeTable()
    const reserved = reserveTable(table)
    expect(reserved.status).toBe('RESERVED')
  })

  it('throws when trying to reserve an OCCUPIED table', () => {
    const table = makeTable()
    const occupied = occupyTable(table, 'order-1')
    expect(() => reserveTable(occupied)).toThrow()
  })

  it('marks any table as CLEANING regardless of prior status', () => {
    const occupied = makeTable({ status: 'OCCUPIED', currentOrderId: 'order-1' })
    const cleaning = markCleaning(occupied)
    expect(cleaning.status).toBe('CLEANING')
  })
})

// ─── 2. Seat capacity validation ──────────────────────────────────────────────

describe('Seat capacity validation', () => {
  it('accepts valid seat counts (1–20)', () => {
    expect(validateSeats(1)).toBe(true)
    expect(validateSeats(4)).toBe(true)
    expect(validateSeats(20)).toBe(true)
  })

  it('rejects seat counts below 1', () => {
    expect(validateSeats(0)).toBe(false)
    expect(validateSeats(-1)).toBe(false)
  })

  it('rejects seat counts above 20', () => {
    expect(validateSeats(21)).toBe(false)
    expect(validateSeats(100)).toBe(false)
  })

  it('rejects non-integer seat values', () => {
    expect(validateSeats(2.5)).toBe(false)
  })
})

// ─── 3. Floor plan position validation ───────────────────────────────────────

describe('Floor plan position validation', () => {
  it('accepts valid grid positions', () => {
    expect(validatePosition(0, 0)).toBe(true)
    expect(validatePosition(5, 3)).toBe(true)
    expect(validatePosition(11, 19)).toBe(true)
  })

  it('rejects negative coordinates', () => {
    expect(validatePosition(-1, 0)).toBe(false)
    expect(validatePosition(0, -1)).toBe(false)
  })

  it('rejects positions outside grid bounds', () => {
    expect(validatePosition(12, 0)).toBe(false)
    expect(validatePosition(0, 20)).toBe(false)
  })

  it('rejects non-integer coordinates', () => {
    expect(validatePosition(1.5, 0)).toBe(false)
    expect(validatePosition(0, 0.5)).toBe(false)
  })
})

// ─── 4. Occupancy rate calculation ────────────────────────────────────────────

describe('Occupancy rate calculation', () => {
  it('returns 0 when no tables', () => {
    expect(calculateOccupancyRate([])).toBe(0)
  })

  it('returns 0 when all tables are AVAILABLE', () => {
    const tables = [makeTable({ id: 'a' }), makeTable({ id: 'b' })]
    expect(calculateOccupancyRate(tables)).toBe(0)
  })

  it('returns 100 when all tables are OCCUPIED', () => {
    const tables = [
      makeTable({ id: 'a', status: 'OCCUPIED', currentOrderId: 'o1' }),
      makeTable({ id: 'b', status: 'OCCUPIED', currentOrderId: 'o2' }),
    ]
    expect(calculateOccupancyRate(tables)).toBe(100)
  })

  it('calculates partial occupancy rate correctly', () => {
    const tables = [
      makeTable({ id: 'a', status: 'OCCUPIED', currentOrderId: 'o1' }),
      makeTable({ id: 'b' }),
      makeTable({ id: 'c' }),
      makeTable({ id: 'd' }),
    ]
    expect(calculateOccupancyRate(tables)).toBe(25)
  })
})

// ─── 5. Table assignment logic ────────────────────────────────────────────────

describe('Table assignment to order', () => {
  const table = makeTable({ id: 'tbl-5', number: 5 })

  const baseOrder: Order = {
    id: 'order-xyz',
    storeId: 'store-1',
    tableId: null,
    tableNumber: null,
    total: 150000,
    status: 'PAID',
  }

  it('assigns tableId and tableNumber to an order', () => {
    const order = assignTableToOrder(baseOrder, table)
    expect(order.tableId).toBe('tbl-5')
    expect(order.tableNumber).toBe(5)
  })

  it('order without table has null tableId', () => {
    expect(baseOrder.tableId).toBeNull()
    expect(baseOrder.tableNumber).toBeNull()
  })

  it('assigning table does not mutate the original order', () => {
    assignTableToOrder(baseOrder, table)
    expect(baseOrder.tableId).toBeNull()
  })

  it('isTableAvailable returns false for OCCUPIED, RESERVED, CLEANING', () => {
    expect(isTableAvailable(makeTable({ status: 'OCCUPIED', currentOrderId: 'o1' }))).toBe(false)
    expect(isTableAvailable(makeTable({ status: 'RESERVED' }))).toBe(false)
    expect(isTableAvailable(makeTable({ status: 'CLEANING' }))).toBe(false)
  })
})

// ─── Table number formatting ──────────────────────────────────────────────────

describe('Table number formatting', () => {
  it('formats single-digit numbers with leading zero', () => {
    expect(formatTableNumber(1)).toBe('01')
    expect(formatTableNumber(9)).toBe('09')
  })

  it('formats double-digit numbers without leading zero', () => {
    expect(formatTableNumber(10)).toBe('10')
    expect(formatTableNumber(99)).toBe('99')
  })

  it('generates correct order header label for table', () => {
    expect(tableLabel(5)).toBe('Meja 05')
    expect(tableLabel(12)).toBe('Meja 12')
  })

  it('generates empty label when no table assigned', () => {
    expect(tableLabel(null)).toBe('')
  })
})
