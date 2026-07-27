import { describe, it, expect } from 'vitest'
import { formatTableNumber } from '@/components/pos/TableMapClient'

// ─── Types ────────────────────────────────────────────────────────────────────

type TableStatus = 'FREE' | 'OCCUPIED' | 'RESERVED'

interface TableRecord {
  id: string
  storeId: string
  number: number
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

/** Transition a table from FREE → OCCUPIED when an order is assigned */
function occupyTable(table: TableRecord, orderId: string): TableRecord {
  if (table.status !== 'FREE') throw new Error(`Cannot occupy table with status ${table.status}`)
  return { ...table, status: 'OCCUPIED', currentOrderId: orderId }
}

/** Release a table back to FREE when the order is paid/cleared */
function releaseTable(table: TableRecord): TableRecord {
  return { ...table, status: 'FREE', currentOrderId: null, currentOrderTotal: null }
}

/** Reserve a table */
function reserveTable(table: TableRecord): TableRecord {
  if (table.status !== 'FREE') throw new Error(`Cannot reserve table with status ${table.status}`)
  return { ...table, status: 'RESERVED' }
}

/** Assign tableId/tableNumber to an order */
function assignTableToOrder(order: Order, table: TableRecord): Order {
  return { ...order, tableId: table.id, tableNumber: table.number }
}

/** Check if a table is safe to occupy (no concurrent conflict) */
function isTableAvailable(table: TableRecord): boolean {
  return table.status === 'FREE'
}

/** Get display label for table in order header */
function tableLabel(tableNumber: number | null): string {
  if (tableNumber === null) return ''
  return `Meja ${formatTableNumber(tableNumber)}`
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Table status transitions', () => {
  const freeTable: TableRecord = {
    id: 'tbl-1',
    storeId: 'store-1',
    number: 1,
    status: 'FREE',
    currentOrderId: null,
  }

  it('transitions FREE → OCCUPIED when order is assigned', () => {
    const occupied = occupyTable(freeTable, 'order-abc')
    expect(occupied.status).toBe('OCCUPIED')
    expect(occupied.currentOrderId).toBe('order-abc')
  })

  it('transitions OCCUPIED → FREE when order is released', () => {
    const occupied = occupyTable(freeTable, 'order-abc')
    const released = releaseTable(occupied)
    expect(released.status).toBe('FREE')
    expect(released.currentOrderId).toBeNull()
  })

  it('throws when trying to occupy an already OCCUPIED table', () => {
    const occupied = occupyTable(freeTable, 'order-1')
    expect(() => occupyTable(occupied, 'order-2')).toThrow()
  })

  it('transitions FREE → RESERVED', () => {
    const reserved = reserveTable(freeTable)
    expect(reserved.status).toBe('RESERVED')
  })

  it('throws when trying to reserve an OCCUPIED table', () => {
    const occupied = occupyTable(freeTable, 'order-1')
    expect(() => reserveTable(occupied)).toThrow()
  })
})

describe('Table assignment to order', () => {
  const table: TableRecord = {
    id: 'tbl-5',
    storeId: 'store-1',
    number: 5,
    status: 'FREE',
    currentOrderId: null,
  }

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
})

describe('Concurrent table safety', () => {
  const table: TableRecord = {
    id: 'tbl-2',
    storeId: 'store-1',
    number: 2,
    status: 'FREE',
    currentOrderId: null,
  }

  it('isTableAvailable returns true for FREE table', () => {
    expect(isTableAvailable(table)).toBe(true)
  })

  it('isTableAvailable returns false for OCCUPIED table', () => {
    const occupied: TableRecord = { ...table, status: 'OCCUPIED', currentOrderId: 'order-1' }
    expect(isTableAvailable(occupied)).toBe(false)
  })

  it('isTableAvailable returns false for RESERVED table', () => {
    const reserved: TableRecord = { ...table, status: 'RESERVED' }
    expect(isTableAvailable(reserved)).toBe(false)
  })
})

describe('Table number formatting', () => {
  it('formats single-digit numbers with leading zero', () => {
    expect(formatTableNumber(1)).toBe('01')
    expect(formatTableNumber(9)).toBe('09')
  })

  it('formats double-digit numbers without leading zero', () => {
    expect(formatTableNumber(10)).toBe('10')
    expect(formatTableNumber(20)).toBe('20')
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
