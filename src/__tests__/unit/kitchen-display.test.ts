import { describe, it, expect } from 'vitest'
import {
  isValidTransition,
  nextStatus,
  calcPrepTimeMs,
  elapsedMinutes,
  isOverdue,
  sortByPriority,
  groupByStatus,
  calcAvgPrepTimeByCategory,
  calcBusiestHourHeatmap,
  type KitchenOrder,
  type KitchenOrderStatus,
} from '@/lib/kitchen-display'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<KitchenOrder> & { status: KitchenOrderStatus }): KitchenOrder {
  const now = new Date().toISOString()
  return {
    id: overrides.id ?? 'ko-1',
    orderId: overrides.orderId ?? 'ord-1',
    storeId: overrides.storeId ?? 'store-1',
    orderNumber: overrides.orderNumber ?? 'INV-001',
    tableNumber: overrides.tableNumber ?? null,
    items: overrides.items ?? [{ name: 'Nasi Goreng', qty: 1, category: 'Makanan' }],
    status: overrides.status,
    priority: overrides.priority ?? 0,
    startedAt: overrides.startedAt ?? null,
    readyAt: overrides.readyAt ?? null,
    servedAt: overrides.servedAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString()
}

// ─── 1. Order status transitions ──────────────────────────────────────────────

describe('isValidTransition', () => {
  it('allows NEW → PREPARING', () => {
    expect(isValidTransition('NEW', 'PREPARING')).toBe(true)
  })

  it('allows PREPARING → READY', () => {
    expect(isValidTransition('PREPARING', 'READY')).toBe(true)
  })

  it('allows READY → SERVED', () => {
    expect(isValidTransition('READY', 'SERVED')).toBe(true)
  })

  it('rejects backwards transition READY → NEW', () => {
    expect(isValidTransition('READY', 'NEW')).toBe(false)
  })

  it('rejects skipping a step NEW → READY', () => {
    expect(isValidTransition('NEW', 'READY')).toBe(false)
  })

  it('nextStatus returns null for terminal SERVED', () => {
    expect(nextStatus('SERVED')).toBeNull()
  })
})

// ─── 2. Prep time calculation ──────────────────────────────────────────────────

describe('calcPrepTimeMs', () => {
  it('calculates ms between startedAt and readyAt', () => {
    const start = new Date(Date.now() - 15 * 60_000).toISOString()
    const end   = new Date(Date.now()).toISOString()
    const ms = calcPrepTimeMs(start, end)
    // 15 min in ms, allow ±1s tolerance
    expect(ms).toBeGreaterThanOrEqual(14 * 60_000)
    expect(ms).toBeLessThanOrEqual(16 * 60_000)
  })

  it('returns 0 when startedAt is null', () => {
    expect(calcPrepTimeMs(null)).toBe(0)
  })

  it('uses current time when endAt is omitted', () => {
    const start = minutesAgo(5)
    const ms = calcPrepTimeMs(start)
    expect(ms).toBeGreaterThan(4 * 60_000)
    expect(ms).toBeLessThan(6 * 60_000)
  })
})

// ─── 3. Priority queue ordering ───────────────────────────────────────────────

describe('sortByPriority', () => {
  it('sorts higher-priority orders first', () => {
    const orders = [
      makeOrder({ id: 'a', status: 'NEW', priority: 1 }),
      makeOrder({ id: 'b', status: 'NEW', priority: 3 }),
      makeOrder({ id: 'c', status: 'NEW', priority: 0 }),
    ]
    const sorted = sortByPriority(orders)
    expect(sorted[0].id).toBe('b')
    expect(sorted[1].id).toBe('a')
    expect(sorted[2].id).toBe('c')
  })

  it('uses FIFO (createdAt) for equal-priority orders', () => {
    const earlier = minutesAgo(10)
    const later   = minutesAgo(2)
    const orders = [
      makeOrder({ id: 'x', status: 'NEW', priority: 1, createdAt: later }),
      makeOrder({ id: 'y', status: 'NEW', priority: 1, createdAt: earlier }),
    ]
    const sorted = sortByPriority(orders)
    expect(sorted[0].id).toBe('y') // earlier first
  })
})

// ─── 4. Overdue detection (>10 min) ──────────────────────────────────────────

describe('isOverdue', () => {
  it('flags NEW order older than 10 minutes as overdue', () => {
    const order = makeOrder({ status: 'NEW', createdAt: minutesAgo(11) })
    expect(isOverdue(order)).toBe(true)
  })

  it('does not flag NEW order within 10 minutes', () => {
    const order = makeOrder({ status: 'NEW', createdAt: minutesAgo(9) })
    expect(isOverdue(order)).toBe(false)
  })

  it('never flags PREPARING orders as overdue', () => {
    const order = makeOrder({ status: 'PREPARING', createdAt: minutesAgo(20) })
    expect(isOverdue(order)).toBe(false)
  })

  it('respects custom threshold', () => {
    const order = makeOrder({ status: 'NEW', createdAt: minutesAgo(6) })
    expect(isOverdue(order, 5)).toBe(true)
    expect(isOverdue(order, 10)).toBe(false)
  })
})

// ─── 5. Analytics aggregation ─────────────────────────────────────────────────

describe('calcAvgPrepTimeByCategory', () => {
  it('computes average prep time per category', () => {
    const start = minutesAgo(20)
    const ready = minutesAgo(10) // 10 min prep
    const orders: KitchenOrder[] = [
      makeOrder({
        id: 'o1',
        status: 'SERVED',
        startedAt: start,
        readyAt: ready,
        items: [{ name: 'Nasi Goreng', qty: 1, category: 'Makanan' }],
      }),
      makeOrder({
        id: 'o2',
        status: 'SERVED',
        startedAt: start,
        readyAt: ready,
        items: [{ name: 'Es Teh', qty: 2, category: 'Minuman' }],
      }),
    ]
    const stats = calcAvgPrepTimeByCategory(orders)
    const makanan = stats.find(s => s.category === 'Makanan')
    const minuman = stats.find(s => s.category === 'Minuman')
    expect(makanan).toBeDefined()
    expect(minuman).toBeDefined()
    // Both ~10 min
    expect(makanan!.avgMs).toBeGreaterThan(9 * 60_000)
    expect(makanan!.avgMs).toBeLessThan(11 * 60_000)
  })

  it('skips orders without startedAt or readyAt', () => {
    const orders = [makeOrder({ status: 'NEW', startedAt: null, readyAt: null })]
    expect(calcAvgPrepTimeByCategory(orders)).toHaveLength(0)
  })
})

describe('calcBusiestHourHeatmap', () => {
  it('always returns 24 buckets', () => {
    const heatmap = calcBusiestHourHeatmap([])
    expect(heatmap).toHaveLength(24)
    expect(heatmap[0].hour).toBe(0)
    expect(heatmap[23].hour).toBe(23)
  })

  it('counts order occurrences per hour', () => {
    // Build dates using local time so getHours() matches the expected bucket
    function localHourDate(h: number): string {
      const d = new Date(2025, 0, 1, h, 0, 0, 0)
      return d.toISOString()
    }
    const orders = [
      makeOrder({ status: 'SERVED', createdAt: localHourDate(9) }),
      makeOrder({ status: 'SERVED', createdAt: localHourDate(9) }),
      makeOrder({ status: 'SERVED', createdAt: localHourDate(14) }),
    ]
    const heatmap = calcBusiestHourHeatmap(orders)
    const h9  = heatmap.find(b => b.hour === 9)
    const h14 = heatmap.find(b => b.hour === 14)
    const h0  = heatmap.find(b => b.hour === 0)
    expect(h9?.count).toBe(2)
    expect(h14?.count).toBe(1)
    expect(h0?.count).toBe(0)
  })
})

// ─── 6. groupByStatus ─────────────────────────────────────────────────────────

describe('groupByStatus', () => {
  it('routes each order to correct lane', () => {
    const orders = [
      makeOrder({ id: '1', status: 'NEW' }),
      makeOrder({ id: '2', status: 'PREPARING' }),
      makeOrder({ id: '3', status: 'READY' }),
      makeOrder({ id: '4', status: 'SERVED' }),
    ]
    const grouped = groupByStatus(orders)
    expect(grouped.NEW.map(o => o.id)).toContain('1')
    expect(grouped.PREPARING.map(o => o.id)).toContain('2')
    expect(grouped.READY.map(o => o.id)).toContain('3')
    expect(grouped.SERVED.map(o => o.id)).toContain('4')
  })
})
