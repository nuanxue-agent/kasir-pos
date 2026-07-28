// Pure business logic for custom dashboard builder — no DB/Next.js deps

export type WidgetType =
  | 'REVENUE_CHART'
  | 'TOP_PRODUCTS'
  | 'LOW_STOCK'
  | 'RECENT_ORDERS'
  | 'KPI_CARD'
  | 'NPS_SCORE'
  | 'COMPLAINT_COUNT'
  | 'QUEUE_STATUS'

export type WidgetSize = 'small' | 'medium' | 'large'

export interface WidgetPosition {
  col: number // 0-based, 0–2
  row: number // 0-based
}

export interface WidgetConfig {
  title?: string
  period?: 'today' | 'week' | 'month'
  limit?: number
  threshold?: number
  [key: string]: unknown
}

export interface LayoutWidget {
  type: WidgetType
  position: WidgetPosition
  size: WidgetSize
  config: WidgetConfig
}

export interface DashboardLayout {
  id: string
  storeId: string
  userId: string
  name: string
  widgets: LayoutWidget[]
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function isValidWidgetType(type: unknown): type is WidgetType {
  return [
    'REVENUE_CHART',
    'TOP_PRODUCTS',
    'LOW_STOCK',
    'RECENT_ORDERS',
    'KPI_CARD',
    'NPS_SCORE',
    'COMPLAINT_COUNT',
    'QUEUE_STATUS',
  ].includes(type as string)
}

export function isValidSize(size: unknown): size is WidgetSize {
  return ['small', 'medium', 'large'].includes(size as string)
}

export function isValidPosition(pos: unknown): pos is WidgetPosition {
  if (!pos || typeof pos !== 'object') return false
  const p = pos as Record<string, unknown>
  return (
    typeof p.col === 'number' &&
    typeof p.row === 'number' &&
    p.col >= 0 &&
    p.col <= 2 &&
    p.row >= 0
  )
}

export interface WidgetValidationResult {
  valid: boolean
  errors: string[]
}

export function validateWidget(w: unknown): WidgetValidationResult {
  const errors: string[] = []
  if (!w || typeof w !== 'object') return { valid: false, errors: ['Widget must be an object'] }
  const widget = w as Record<string, unknown>

  if (!isValidWidgetType(widget.type)) errors.push(`Invalid widget type: ${widget.type}`)
  if (!isValidPosition(widget.position)) errors.push('Invalid position (col 0–2, row >= 0 required)')
  if (!isValidSize(widget.size)) errors.push(`Invalid size: ${widget.size}`)

  return { valid: errors.length === 0, errors }
}

// ── Layout serialization ───────────────────────────────────────────────────────

export function serializeWidgets(widgets: LayoutWidget[]): string {
  return JSON.stringify(widgets)
}

export function deserializeWidgets(raw: string | null | undefined): LayoutWidget[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ── Default layout selection ───────────────────────────────────────────────────

export function selectDefaultLayout(layouts: Pick<DashboardLayout, 'id' | 'isDefault'>[]): string | null {
  if (layouts.length === 0) return null
  const defaultOne = layouts.find(l => l.isDefault)
  return defaultOne ? defaultOne.id : layouts[0].id
}

// ── Widget ordering helpers ────────────────────────────────────────────────────

export function moveWidgetUp(widgets: LayoutWidget[], index: number): LayoutWidget[] {
  if (index <= 0 || index >= widgets.length) return widgets
  const next = [...widgets]
  ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
  return next
}

export function moveWidgetDown(widgets: LayoutWidget[], index: number): LayoutWidget[] {
  if (index < 0 || index >= widgets.length - 1) return widgets
  const next = [...widgets]
  ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
  return next
}

// ── Layout copy ────────────────────────────────────────────────────────────────

export function copyLayout(
  source: DashboardLayout,
  overrides: Partial<Pick<DashboardLayout, 'id' | 'name' | 'userId' | 'createdAt' | 'updatedAt'>>,
): DashboardLayout {
  return {
    ...source,
    ...overrides,
    isDefault: false, // copies are never default
    widgets: source.widgets.map(w => ({ ...w, config: { ...w.config } })),
  }
}

// ── Default starter layout ────────────────────────────────────────────────────

export function buildDefaultWidgets(): LayoutWidget[] {
  return [
    { type: 'REVENUE_CHART',   position: { col: 0, row: 0 }, size: 'large',  config: { period: 'week' } },
    { type: 'KPI_CARD',        position: { col: 0, row: 1 }, size: 'small',  config: { period: 'today' } },
    { type: 'TOP_PRODUCTS',    position: { col: 1, row: 1 }, size: 'medium', config: { limit: 5 } },
    { type: 'LOW_STOCK',       position: { col: 2, row: 1 }, size: 'medium', config: { threshold: 10 } },
    { type: 'RECENT_ORDERS',   position: { col: 0, row: 2 }, size: 'large',  config: { limit: 10 } },
    { type: 'QUEUE_STATUS',    position: { col: 2, row: 2 }, size: 'small',  config: {} },
  ]
}
