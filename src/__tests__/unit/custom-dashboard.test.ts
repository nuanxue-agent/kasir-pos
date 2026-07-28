import { describe, it, expect } from 'vitest'
import {
  validateWidget,
  isValidWidgetType,
  isValidPosition,
  isValidSize,
  serializeWidgets,
  deserializeWidgets,
  selectDefaultLayout,
  moveWidgetUp,
  moveWidgetDown,
  copyLayout,
  buildDefaultWidgets,
} from '@/lib/custom-dashboard'
import type { LayoutWidget, DashboardLayout } from '@/lib/custom-dashboard'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeWidget = (overrides: Partial<LayoutWidget> = {}): LayoutWidget => ({
  type: 'REVENUE_CHART',
  position: { col: 0, row: 0 },
  size: 'medium',
  config: {},
  ...overrides,
})

const makeLayout = (overrides: Partial<DashboardLayout> = {}): DashboardLayout => ({
  id: 'layout-1',
  storeId: 'store-1',
  userId: 'user-1',
  name: 'Test Layout',
  widgets: [makeWidget()],
  isDefault: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
})

// ── 1. Widget position validation ─────────────────────────────────────────────

describe('Widget position validation', () => {
  it('accepts valid position col 0 row 0', () => {
    expect(isValidPosition({ col: 0, row: 0 })).toBe(true)
  })

  it('accepts valid position col 2 row 5', () => {
    expect(isValidPosition({ col: 2, row: 5 })).toBe(true)
  })

  it('rejects col > 2', () => {
    expect(isValidPosition({ col: 3, row: 0 })).toBe(false)
  })

  it('rejects negative col', () => {
    expect(isValidPosition({ col: -1, row: 0 })).toBe(false)
  })

  it('rejects negative row', () => {
    expect(isValidPosition({ col: 0, row: -1 })).toBe(false)
  })

  it('rejects non-object input', () => {
    expect(isValidPosition(null)).toBe(false)
    expect(isValidPosition('0,0')).toBe(false)
  })
})

// ── 2. Widget config validation ───────────────────────────────────────────────

describe('Widget config validation', () => {
  it('validates a fully valid widget', () => {
    const result = validateWidget(makeWidget())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects unknown widget type', () => {
    const result = validateWidget(makeWidget({ type: 'UNKNOWN_TYPE' as any }))
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Invalid widget type'))).toBe(true)
  })

  it('rejects invalid size', () => {
    const result = validateWidget(makeWidget({ size: 'huge' as any }))
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Invalid size'))).toBe(true)
  })

  it('rejects invalid position', () => {
    const result = validateWidget(makeWidget({ position: { col: 5, row: 0 } }))
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Invalid position'))).toBe(true)
  })

  it('validates all valid widget types', () => {
    const types = [
      'REVENUE_CHART', 'TOP_PRODUCTS', 'LOW_STOCK', 'RECENT_ORDERS',
      'KPI_CARD', 'NPS_SCORE', 'COMPLAINT_COUNT', 'QUEUE_STATUS',
    ] as const
    for (const type of types) {
      expect(isValidWidgetType(type)).toBe(true)
    }
  })
})

// ── 3. Layout serialization ───────────────────────────────────────────────────

describe('Layout serialization', () => {
  it('serializes widgets to a JSON string', () => {
    const widgets = [makeWidget({ type: 'KPI_CARD' })]
    const raw = serializeWidgets(widgets)
    expect(typeof raw).toBe('string')
    const parsed = JSON.parse(raw)
    expect(parsed[0].type).toBe('KPI_CARD')
  })

  it('deserializes a valid JSON string back to widgets', () => {
    const widgets = [makeWidget({ type: 'TOP_PRODUCTS', size: 'large' })]
    const raw = serializeWidgets(widgets)
    const back = deserializeWidgets(raw)
    expect(back).toHaveLength(1)
    expect(back[0].type).toBe('TOP_PRODUCTS')
    expect(back[0].size).toBe('large')
  })

  it('deserializes null/undefined to empty array', () => {
    expect(deserializeWidgets(null)).toEqual([])
    expect(deserializeWidgets(undefined)).toEqual([])
    expect(deserializeWidgets('')).toEqual([])
  })

  it('deserializes malformed JSON to empty array', () => {
    expect(deserializeWidgets('not-json')).toEqual([])
    expect(deserializeWidgets('{}')).toEqual([]) // object, not array
  })
})

// ── 4. Default layout selection ───────────────────────────────────────────────

describe('Default layout selection', () => {
  it('returns the layout marked isDefault', () => {
    const layouts = [
      { id: 'a', isDefault: false },
      { id: 'b', isDefault: true },
      { id: 'c', isDefault: false },
    ]
    expect(selectDefaultLayout(layouts)).toBe('b')
  })

  it('returns the first layout when none is default', () => {
    const layouts = [
      { id: 'x', isDefault: false },
      { id: 'y', isDefault: false },
    ]
    expect(selectDefaultLayout(layouts)).toBe('x')
  })

  it('returns null for empty list', () => {
    expect(selectDefaultLayout([])).toBeNull()
  })
})

// ── 5. Layout copy logic ──────────────────────────────────────────────────────

describe('Layout copy logic', () => {
  it('copies a layout with a new id and name', () => {
    const source = makeLayout({ id: 'orig', name: 'Original', isDefault: true })
    const copy = copyLayout(source, { id: 'copy-1', name: 'Copy of Original' })
    expect(copy.id).toBe('copy-1')
    expect(copy.name).toBe('Copy of Original')
  })

  it('copied layout is never default', () => {
    const source = makeLayout({ isDefault: true })
    const copy = copyLayout(source, { id: 'copy-2', name: 'Copy' })
    expect(copy.isDefault).toBe(false)
  })

  it('copies widgets deeply (no shared references)', () => {
    const widget = makeWidget({ config: { limit: 5 } })
    const source = makeLayout({ widgets: [widget] })
    const copy = copyLayout(source, { id: 'copy-3', name: 'Deep Copy' })
    // mutate source config — copy should be unaffected
    source.widgets[0].config.limit = 999
    expect(copy.widgets[0].config.limit).toBe(5)
  })

  it('preserves storeId and userId from source', () => {
    const source = makeLayout({ storeId: 'store-abc', userId: 'user-xyz' })
    const copy = copyLayout(source, { id: 'copy-4', name: 'Clone' })
    expect(copy.storeId).toBe('store-abc')
    expect(copy.userId).toBe('user-xyz')
  })
})

// ── 6. Widget reorder (up/down buttons) ───────────────────────────────────────

describe('Widget reorder', () => {
  const w1 = makeWidget({ type: 'REVENUE_CHART' })
  const w2 = makeWidget({ type: 'TOP_PRODUCTS' })
  const w3 = makeWidget({ type: 'LOW_STOCK' })

  it('moves a widget up correctly', () => {
    const result = moveWidgetUp([w1, w2, w3], 1)
    expect(result[0].type).toBe('TOP_PRODUCTS')
    expect(result[1].type).toBe('REVENUE_CHART')
    expect(result[2].type).toBe('LOW_STOCK')
  })

  it('moves a widget down correctly', () => {
    const result = moveWidgetDown([w1, w2, w3], 1)
    expect(result[0].type).toBe('REVENUE_CHART')
    expect(result[1].type).toBe('LOW_STOCK')
    expect(result[2].type).toBe('TOP_PRODUCTS')
  })

  it('does not move first widget further up', () => {
    const result = moveWidgetUp([w1, w2, w3], 0)
    expect(result[0].type).toBe('REVENUE_CHART')
  })

  it('does not move last widget further down', () => {
    const result = moveWidgetDown([w1, w2, w3], 2)
    expect(result[2].type).toBe('LOW_STOCK')
  })
})

// ── 7. Default widgets builder ────────────────────────────────────────────────

describe('buildDefaultWidgets', () => {
  it('returns a non-empty array', () => {
    const widgets = buildDefaultWidgets()
    expect(widgets.length).toBeGreaterThan(0)
  })

  it('all default widgets have valid positions', () => {
    const widgets = buildDefaultWidgets()
    for (const w of widgets) {
      expect(isValidPosition(w.position)).toBe(true)
    }
  })

  it('all default widgets have valid types', () => {
    const widgets = buildDefaultWidgets()
    for (const w of widgets) {
      expect(isValidWidgetType(w.type)).toBe(true)
    }
  })
})
