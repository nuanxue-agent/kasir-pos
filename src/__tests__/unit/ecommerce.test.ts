import { describe, it, expect } from 'vitest'

// ─── Types ────────────────────────────────────────────────────────────────────

type OnlineChannel = 'WOOCOMMERCE' | 'TOKOPEDIA' | 'SHOPEE' | 'DIRECT'
type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'FAILED'

interface OrderItem {
  sku: string
  name: string
  qty: number
  price: number
}

interface OnlineOrder {
  id: string
  storeId: string
  channel: OnlineChannel
  externalId: string
  customerName: string
  items: OrderItem[]
  total: number
  status: OrderStatus
  createdAt: string
}

interface StockItem {
  id: string
  productId: string
  sku: string
  name: string
  stock: number
  trackStock: boolean
}

// ─── Pure functions (mirrors of production logic) ──────────────────────────────

/** Normalize channel-specific status strings to unified OrderStatus */
function normalizeStatus(channel: OnlineChannel, rawStatus: string): OrderStatus {
  const map: Record<OnlineChannel, Record<string, OrderStatus>> = {
    WOOCOMMERCE: {
      pending: 'PENDING',
      processing: 'CONFIRMED',
      'on-hold': 'PENDING',
      completed: 'COMPLETED',
      cancelled: 'CANCELLED',
      refunded: 'REFUNDED',
      failed: 'FAILED',
    },
    TOKOPEDIA: {
      waiting_payment: 'PENDING',
      payment_verified: 'CONFIRMED',
      seller_process: 'PROCESSING',
      ready_to_ship: 'PROCESSING',
      shipped: 'SHIPPED',
      delivered: 'COMPLETED',
      cancelled: 'CANCELLED',
    },
    SHOPEE: {
      unpaid: 'PENDING',
      ready_to_ship: 'CONFIRMED',
      processed: 'PROCESSING',
      shipped: 'SHIPPED',
      completed: 'COMPLETED',
      cancelled: 'CANCELLED',
      in_cancel: 'CANCELLED',
    },
    DIRECT: {
      pending: 'PENDING',
      confirmed: 'CONFIRMED',
      processing: 'PROCESSING',
      completed: 'COMPLETED',
      cancelled: 'CANCELLED',
    },
  }
  return map[channel]?.[rawStatus] ?? 'PENDING'
}

/** Calculate order total from items */
function calcOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, i) => sum + i.qty * i.price, 0)
}

/** Deduct stock for synced items; returns updated stock map */
function deductStock(
  inventory: StockItem[],
  orderItems: OrderItem[],
): StockItem[] {
  const updated = inventory.map(s => ({ ...s }))
  for (const item of orderItems) {
    const stock = updated.find(s => s.sku === item.sku || s.name === item.name)
    if (!stock || !stock.trackStock) continue
    stock.stock = Math.max(0, stock.stock - item.qty)
  }
  return updated
}

/** Prevent duplicate orders by channel + externalId */
function isDuplicate(
  existing: OnlineOrder[],
  channel: OnlineChannel,
  externalId: string,
): boolean {
  return existing.some(o => o.channel === channel && o.externalId === externalId)
}

/** Filter new orders that are not duplicates */
function filterNewOrders(
  existing: OnlineOrder[],
  incoming: OnlineOrder[],
): OnlineOrder[] {
  return incoming.filter(o => !isDuplicate(existing, o.channel, o.externalId))
}

/** Map raw channel order to OnlineOrder shape */
function mapChannelOrder(
  channel: OnlineChannel,
  raw: { externalId: string; customerName: string; items: OrderItem[]; total: number; status: string },
  storeId: string,
): Omit<OnlineOrder, 'id' | 'createdAt'> {
  return {
    storeId,
    channel,
    externalId: raw.externalId,
    customerName: raw.customerName,
    items: raw.items,
    total: raw.total,
    status: normalizeStatus(channel, raw.status),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('E-Commerce — channel order mapping', () => {
  it('maps WooCommerce order fields correctly', () => {
    const raw = {
      externalId: 'wc-123',
      customerName: 'Budi',
      items: [{ sku: 'A1', name: 'Kopi', qty: 2, price: 15000 }],
      total: 30000,
      status: 'processing',
    }
    const order = mapChannelOrder('WOOCOMMERCE', raw, 'store-1')
    expect(order.channel).toBe('WOOCOMMERCE')
    expect(order.externalId).toBe('wc-123')
    expect(order.customerName).toBe('Budi')
    expect(order.status).toBe('CONFIRMED')
    expect(order.total).toBe(30000)
  })

  it('maps Tokopedia order fields correctly', () => {
    const raw = {
      externalId: 'toped-456',
      customerName: 'Siti',
      items: [{ sku: 'B2', name: 'Teh', qty: 1, price: 10000 }],
      total: 10000,
      status: 'payment_verified',
    }
    const order = mapChannelOrder('TOKOPEDIA', raw, 'store-1')
    expect(order.channel).toBe('TOKOPEDIA')
    expect(order.status).toBe('CONFIRMED')
    expect(order.externalId).toBe('toped-456')
  })

  it('maps Shopee order fields correctly', () => {
    const raw = {
      externalId: 'shopee-789',
      customerName: 'Andi',
      items: [{ sku: 'C3', name: 'Susu', qty: 3, price: 8000 }],
      total: 24000,
      status: 'ready_to_ship',
    }
    const order = mapChannelOrder('SHOPEE', raw, 'store-1')
    expect(order.channel).toBe('SHOPEE')
    expect(order.status).toBe('CONFIRMED')
    expect(order.total).toBe(24000)
  })
})

describe('E-Commerce — status normalization', () => {
  it('normalizes WooCommerce statuses', () => {
    expect(normalizeStatus('WOOCOMMERCE', 'pending')).toBe('PENDING')
    expect(normalizeStatus('WOOCOMMERCE', 'processing')).toBe('CONFIRMED')
    expect(normalizeStatus('WOOCOMMERCE', 'completed')).toBe('COMPLETED')
    expect(normalizeStatus('WOOCOMMERCE', 'cancelled')).toBe('CANCELLED')
    expect(normalizeStatus('WOOCOMMERCE', 'refunded')).toBe('REFUNDED')
    expect(normalizeStatus('WOOCOMMERCE', 'failed')).toBe('FAILED')
  })

  it('normalizes Tokopedia statuses', () => {
    expect(normalizeStatus('TOKOPEDIA', 'waiting_payment')).toBe('PENDING')
    expect(normalizeStatus('TOKOPEDIA', 'payment_verified')).toBe('CONFIRMED')
    expect(normalizeStatus('TOKOPEDIA', 'shipped')).toBe('SHIPPED')
    expect(normalizeStatus('TOKOPEDIA', 'delivered')).toBe('COMPLETED')
  })

  it('normalizes Shopee statuses', () => {
    expect(normalizeStatus('SHOPEE', 'unpaid')).toBe('PENDING')
    expect(normalizeStatus('SHOPEE', 'ready_to_ship')).toBe('CONFIRMED')
    expect(normalizeStatus('SHOPEE', 'shipped')).toBe('SHIPPED')
    expect(normalizeStatus('SHOPEE', 'in_cancel')).toBe('CANCELLED')
  })

  it('falls back to PENDING for unknown status', () => {
    expect(normalizeStatus('WOOCOMMERCE', 'unknown_status_xyz')).toBe('PENDING')
    expect(normalizeStatus('SHOPEE', '')).toBe('PENDING')
  })
})

describe('E-Commerce — total calculation', () => {
  it('calculates total from multiple items', () => {
    const items: OrderItem[] = [
      { sku: 'A1', name: 'Kopi', qty: 2, price: 15000 },
      { sku: 'B2', name: 'Roti', qty: 3, price: 8000 },
    ]
    expect(calcOrderTotal(items)).toBe(54000)
  })

  it('returns 0 for empty items', () => {
    expect(calcOrderTotal([])).toBe(0)
  })

  it('handles single item', () => {
    const items: OrderItem[] = [{ sku: 'X1', name: 'Produk', qty: 5, price: 10000 }]
    expect(calcOrderTotal(items)).toBe(50000)
  })
})

describe('E-Commerce — stock deduction on sync', () => {
  it('deducts stock when sku matches', () => {
    const inventory: StockItem[] = [
      { id: 'inv-1', productId: 'p1', sku: 'A1', name: 'Kopi', stock: 20, trackStock: true },
    ]
    const items: OrderItem[] = [{ sku: 'A1', name: 'Kopi', qty: 3, price: 15000 }]
    const updated = deductStock(inventory, items)
    expect(updated[0].stock).toBe(17)
  })

  it('does not go below 0', () => {
    const inventory: StockItem[] = [
      { id: 'inv-2', productId: 'p2', sku: 'B2', name: 'Teh', stock: 2, trackStock: true },
    ]
    const items: OrderItem[] = [{ sku: 'B2', name: 'Teh', qty: 10, price: 5000 }]
    const updated = deductStock(inventory, items)
    expect(updated[0].stock).toBe(0)
  })

  it('skips items where trackStock is false', () => {
    const inventory: StockItem[] = [
      { id: 'inv-3', productId: 'p3', sku: 'C3', name: 'Jasa', stock: 999, trackStock: false },
    ]
    const items: OrderItem[] = [{ sku: 'C3', name: 'Jasa', qty: 5, price: 20000 }]
    const updated = deductStock(inventory, items)
    expect(updated[0].stock).toBe(999)
  })

  it('falls back to name matching when sku differs', () => {
    const inventory: StockItem[] = [
      { id: 'inv-4', productId: 'p4', sku: '', name: 'Susu Sapi', stock: 15, trackStock: true },
    ]
    const items: OrderItem[] = [{ sku: 'unknown-sku', name: 'Susu Sapi', qty: 4, price: 12000 }]
    const updated = deductStock(inventory, items)
    expect(updated[0].stock).toBe(11)
  })
})

describe('E-Commerce — duplicate order prevention', () => {
  const existing: OnlineOrder[] = [
    {
      id: 'o1',
      storeId: 's1',
      channel: 'WOOCOMMERCE',
      externalId: 'wc-100',
      customerName: 'Budi',
      items: [],
      total: 0,
      status: 'CONFIRMED',
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'o2',
      storeId: 's1',
      channel: 'TOKOPEDIA',
      externalId: 'toped-200',
      customerName: 'Siti',
      items: [],
      total: 0,
      status: 'PENDING',
      createdAt: '2024-01-01T00:00:00Z',
    },
  ]

  it('detects a duplicate order', () => {
    expect(isDuplicate(existing, 'WOOCOMMERCE', 'wc-100')).toBe(true)
    expect(isDuplicate(existing, 'TOKOPEDIA', 'toped-200')).toBe(true)
  })

  it('does not flag different channel as duplicate', () => {
    expect(isDuplicate(existing, 'SHOPEE', 'wc-100')).toBe(false)
  })

  it('does not flag new externalId as duplicate', () => {
    expect(isDuplicate(existing, 'WOOCOMMERCE', 'wc-999')).toBe(false)
  })

  it('filters only new orders from incoming batch', () => {
    const incoming: OnlineOrder[] = [
      { ...existing[0] }, // duplicate
      {
        id: 'o3',
        storeId: 's1',
        channel: 'SHOPEE',
        externalId: 'shopee-300',
        customerName: 'Andi',
        items: [],
        total: 0,
        status: 'CONFIRMED',
        createdAt: '2024-01-02T00:00:00Z',
      },
    ]
    const newOrders = filterNewOrders(existing, incoming)
    expect(newOrders).toHaveLength(1)
    expect(newOrders[0].externalId).toBe('shopee-300')
  })
})
