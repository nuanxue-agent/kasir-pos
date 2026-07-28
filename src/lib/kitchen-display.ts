// ─── Kitchen Display System — pure business logic (no I/O) ────────────────────
// Importable by tests without any DB or Next.js dependencies.

export type KitchenOrderStatus = 'NEW' | 'PREPARING' | 'READY' | 'SERVED'

export interface KitchenOrderItem {
  name: string
  qty: number
  category?: string | null
  note?: string | null
}

export interface KitchenOrder {
  id: string
  orderId: string
  storeId: string
  orderNumber: string
  tableNumber?: number | null
  items: KitchenOrderItem[]
  status: KitchenOrderStatus
  priority: number
  startedAt?: string | null
  readyAt?: string | null
  servedAt?: string | null
  createdAt: string
  updatedAt: string
}

// ─── Status machine ────────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<KitchenOrderStatus, KitchenOrderStatus | null> = {
  NEW: 'PREPARING',
  PREPARING: 'READY',
  READY: 'SERVED',
  SERVED: null,
}

/** Returns true if transitioning from `from` → `to` is valid. */
export function isValidTransition(from: KitchenOrderStatus, to: KitchenOrderStatus): boolean {
  return VALID_TRANSITIONS[from] === to
}

/** Returns the next status in the pipeline, or null if terminal. */
export function nextStatus(status: KitchenOrderStatus): KitchenOrderStatus | null {
  return VALID_TRANSITIONS[status]
}

// ─── Prep time ────────────────────────────────────────────────────────────────

/** Milliseconds between start and end (or now if end is null). */
export function calcPrepTimeMs(startedAt: string | null | undefined, endAt?: string | null): number {
  if (!startedAt) return 0
  const start = new Date(startedAt).getTime()
  const end = endAt ? new Date(endAt).getTime() : Date.now()
  return Math.max(0, end - start)
}

/** Returns elapsed minutes since createdAt (float). */
export function elapsedMinutes(createdAt: string, now = Date.now()): number {
  return (now - new Date(createdAt).getTime()) / 60_000
}

/** Returns true when order has been waiting (in NEW) more than thresholdMin. */
export function isOverdue(order: KitchenOrder, thresholdMin = 10, now = Date.now()): boolean {
  if (order.status !== 'NEW') return false
  return elapsedMinutes(order.createdAt, now) > thresholdMin
}

// ─── Priority queue ───────────────────────────────────────────────────────────

/**
 * Sort orders by priority desc, then by createdAt asc (FIFO within same priority).
 * Higher priority value = more urgent.
 */
export function sortByPriority(orders: KitchenOrder[]): KitchenOrder[] {
  return [...orders].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}

/** Group orders into the four lane buckets. */
export function groupByStatus(orders: KitchenOrder[]): Record<KitchenOrderStatus, KitchenOrder[]> {
  const result: Record<KitchenOrderStatus, KitchenOrder[]> = {
    NEW: [],
    PREPARING: [],
    READY: [],
    SERVED: [],
  }
  for (const o of orders) {
    result[o.status].push(o)
  }
  // Sort each lane
  for (const lane of Object.keys(result) as KitchenOrderStatus[]) {
    result[lane] = sortByPriority(result[lane])
  }
  return result
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface PrepTimeStat {
  category: string
  avgMs: number
  count: number
}

export interface HourBucket {
  hour: number // 0–23
  count: number
}

/**
 * Compute average prep time (startedAt → readyAt) grouped by item category.
 * Only orders that reached READY/SERVED with both timestamps are included.
 */
export function calcAvgPrepTimeByCategory(orders: KitchenOrder[]): PrepTimeStat[] {
  const map = new Map<string, { totalMs: number; count: number }>()

  for (const o of orders) {
    if (!o.startedAt || !o.readyAt) continue
    const ms = calcPrepTimeMs(o.startedAt, o.readyAt)
    for (const item of o.items) {
      const cat = item.category ?? 'Uncategorized'
      const entry = map.get(cat) ?? { totalMs: 0, count: 0 }
      entry.totalMs += ms
      entry.count += 1
      map.set(cat, entry)
    }
  }

  return Array.from(map.entries()).map(([category, { totalMs, count }]) => ({
    category,
    avgMs: count > 0 ? totalMs / count : 0,
    count,
  }))
}

/**
 * Build 24-bucket heatmap of order creation hour.
 * Returns all 24 hours (0–23), with count = 0 for quiet hours.
 */
export function calcBusiestHourHeatmap(orders: KitchenOrder[]): HourBucket[] {
  const counts = new Array<number>(24).fill(0)
  for (const o of orders) {
    const h = new Date(o.createdAt).getHours()
    counts[h] += 1
  }
  return counts.map((count, hour) => ({ hour, count }))
}
