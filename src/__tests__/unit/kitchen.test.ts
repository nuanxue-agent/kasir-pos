import { describe, it, expect } from 'vitest'

// ── Types ──────────────────────────────────────────────────────────────────────

type TicketStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'

interface KotItem {
  name: string
  qty: number
  note?: string
  category?: string
}

interface KitchenTicket {
  id: string
  storeId: string
  tableNumber: number
  items: KotItem[]
  status: TicketStatus
  note?: string | null
  createdAt: string
  updatedAt: string
}

// ── Pure functions under test ──────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  PENDING:     ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED:   [],
}

function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

function applyTransition(ticket: KitchenTicket, to: TicketStatus): KitchenTicket {
  if (!canTransition(ticket.status, to)) {
    throw new Error(`Invalid transition: ${ticket.status} → ${to}`)
  }
  return { ...ticket, status: to, updatedAt: new Date().toISOString() }
}

function elapsedSeconds(createdAt: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(createdAt).getTime()) / 1000)
}

function formatElapsed(createdAt: string, now: Date = new Date()): string {
  const diff = elapsedSeconds(createdAt, now)
  if (diff < 60) return `${diff}d`
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}j ${mins % 60}m`
}

function groupItemsByCategory(items: KotItem[]): Record<string, KotItem[]> {
  const groups: Record<string, KotItem[]> = {}
  for (const item of items) {
    const cat = item.category ?? 'Umum'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(item)
  }
  return groups
}

function createKot(
  storeId: string,
  tableNumber: number,
  items: KotItem[],
  note?: string,
): Omit<KitchenTicket, 'id'> {
  if (tableNumber < 1 || !Number.isInteger(tableNumber)) {
    throw new Error('tableNumber must be a positive integer')
  }
  if (items.length === 0) {
    throw new Error('items must be non-empty')
  }
  const now = new Date().toISOString()
  return {
    storeId,
    tableNumber,
    items,
    status: 'PENDING',
    note: note ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('KOT creation', () => {
  it('creates a ticket with PENDING status', () => {
    const kot = createKot('store-1', 3, [{ name: 'Nasi Goreng', qty: 2 }])
    expect(kot.status).toBe('PENDING')
    expect(kot.tableNumber).toBe(3)
    expect(kot.storeId).toBe('store-1')
  })

  it('stores all items on the ticket', () => {
    const items: KotItem[] = [
      { name: 'Nasi Goreng', qty: 1 },
      { name: 'Es Teh', qty: 2, note: 'less sugar' },
    ]
    const kot = createKot('store-1', 1, items)
    expect(kot.items).toHaveLength(2)
    expect(kot.items[1].note).toBe('less sugar')
  })

  it('stores optional order note', () => {
    const kot = createKot('store-1', 5, [{ name: 'Mie Goreng', qty: 1 }], 'extra spicy')
    expect(kot.note).toBe('extra spicy')
  })

  it('throws for invalid table number (zero)', () => {
    expect(() => createKot('store-1', 0, [{ name: 'X', qty: 1 }])).toThrow()
  })

  it('throws for empty items array', () => {
    expect(() => createKot('store-1', 1, [])).toThrow()
  })
})

describe('Ticket status transitions', () => {
  const base: KitchenTicket = {
    id: 'tk-1',
    storeId: 'store-1',
    tableNumber: 2,
    items: [{ name: 'Sate', qty: 5 }],
    status: 'PENDING',
    note: null,
    createdAt: '2025-01-01T10:00:00.000Z',
    updatedAt: '2025-01-01T10:00:00.000Z',
  }

  it('PENDING → IN_PROGRESS is valid', () => {
    expect(canTransition('PENDING', 'IN_PROGRESS')).toBe(true)
  })

  it('IN_PROGRESS → COMPLETED is valid', () => {
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true)
  })

  it('PENDING → COMPLETED is invalid (must go through IN_PROGRESS)', () => {
    expect(canTransition('PENDING', 'COMPLETED')).toBe(false)
  })

  it('COMPLETED has no further transitions', () => {
    expect(VALID_TRANSITIONS['COMPLETED']).toHaveLength(0)
  })

  it('applyTransition updates status and updatedAt', () => {
    const updated = applyTransition(base, 'IN_PROGRESS')
    expect(updated.status).toBe('IN_PROGRESS')
    expect(updated.updatedAt).not.toBe(base.updatedAt)
  })

  it('applyTransition throws on invalid transition', () => {
    expect(() => applyTransition(base, 'COMPLETED')).toThrow()
  })
})

describe('Time elapsed calculation', () => {
  it('returns seconds when under 1 minute', () => {
    const now = new Date('2025-01-01T10:00:45.000Z')
    const result = formatElapsed('2025-01-01T10:00:00.000Z', now)
    expect(result).toBe('45d')
  })

  it('returns minutes when under 1 hour', () => {
    const now = new Date('2025-01-01T10:25:00.000Z')
    const result = formatElapsed('2025-01-01T10:00:00.000Z', now)
    expect(result).toBe('25m')
  })

  it('returns hours and minutes for long-running tickets', () => {
    const now = new Date('2025-01-01T11:35:00.000Z')
    const result = formatElapsed('2025-01-01T10:00:00.000Z', now)
    expect(result).toBe('1j 35m')
  })
})

describe('Item grouping by category', () => {
  const items: KotItem[] = [
    { name: 'Nasi Goreng', qty: 1, category: 'Makanan' },
    { name: 'Mie Goreng', qty: 2, category: 'Makanan' },
    { name: 'Es Teh', qty: 3, category: 'Minuman' },
    { name: 'Jus Jeruk', qty: 1, category: 'Minuman' },
    { name: 'Kerupuk', qty: 1 }, // no category → 'Umum'
  ]

  it('groups items by category correctly', () => {
    const groups = groupItemsByCategory(items)
    expect(Object.keys(groups)).toHaveLength(3)
    expect(groups['Makanan']).toHaveLength(2)
    expect(groups['Minuman']).toHaveLength(2)
  })

  it('falls back to "Umum" for items without category', () => {
    const groups = groupItemsByCategory(items)
    expect(groups['Umum']).toHaveLength(1)
    expect(groups['Umum'][0].name).toBe('Kerupuk')
  })
})
