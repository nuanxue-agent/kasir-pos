import { describe, it, expect } from 'vitest'

// ── Pure helpers mirrored from API routes ─────────────────────────────────────

type WidgetType =
  | 'REVENUE_TODAY'
  | 'ORDERS_TODAY'
  | 'LOW_STOCK_ALERT'
  | 'TOP_PRODUCTS'
  | 'RECENT_ACTIVITY'
  | 'CASH_FLOW_MINI'
  | 'PENDING_APPROVALS'

type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY'
type ReportType = 'SALES' | 'INVENTORY' | 'PAYROLL' | 'PNL'

interface WidgetPosition {
  col: number
  row: number
}

interface WidgetConfig {
  [key: string]: unknown
}

const VALID_WIDGET_TYPES: WidgetType[] = [
  'REVENUE_TODAY',
  'ORDERS_TODAY',
  'LOW_STOCK_ALERT',
  'TOP_PRODUCTS',
  'RECENT_ACTIVITY',
  'CASH_FLOW_MINI',
  'PENDING_APPROVALS',
]

const VALID_REPORT_TYPES: ReportType[] = ['SALES', 'INVENTORY', 'PAYROLL', 'PNL']
const VALID_FREQUENCIES: Frequency[] = ['DAILY', 'WEEKLY', 'MONTHLY']

// Frequency → cron mapping
const FREQUENCY_CRON: Record<Frequency, string> = {
  DAILY: '0 8 * * *',
  WEEKLY: '0 8 * * 1',
  MONTHLY: '0 8 1 * *',
}

function validateWidgetPosition(pos: unknown): string | null {
  if (!pos || typeof pos !== 'object') return 'Position must be an object'
  const p = pos as Record<string, unknown>
  if (typeof p.col !== 'number' || p.col < 1) return 'col must be a positive integer'
  if (typeof p.row !== 'number' || p.row < 1) return 'row must be a positive integer'
  if (!Number.isInteger(p.col)) return 'col must be an integer'
  if (!Number.isInteger(p.row)) return 'row must be an integer'
  return null
}

function validateWidgetType(type: unknown): string | null {
  if (!type || typeof type !== 'string') return 'widgetType is required'
  if (!VALID_WIDGET_TYPES.includes(type as WidgetType)) {
    return `widgetType must be one of: ${VALID_WIDGET_TYPES.join(', ')}`
  }
  return null
}

function validateReportType(type: unknown): string | null {
  if (!type || typeof type !== 'string') return 'reportType is required'
  if (!VALID_REPORT_TYPES.includes(type as ReportType)) {
    return `reportType must be one of: ${VALID_REPORT_TYPES.join(', ')}`
  }
  return null
}

function validateFrequency(frequency: unknown): string | null {
  if (!frequency || typeof frequency !== 'string') return 'frequency is required'
  if (!VALID_FREQUENCIES.includes(frequency as Frequency)) {
    return `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}`
  }
  return null
}

function validateWidgetConfig(config: unknown): string | null {
  if (config === null || config === undefined) return null // config is optional
  if (typeof config !== 'object' || Array.isArray(config)) return 'config must be a plain object'
  return null
}

function calcNextRun(frequency: Frequency, from: Date = new Date()): Date {
  const d = new Date(from)
  switch (frequency) {
    case 'DAILY':
      d.setDate(d.getDate() + 1)
      d.setHours(8, 0, 0, 0)
      break
    case 'WEEKLY':
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
      d.setHours(8, 0, 0, 0)
      break
    case 'MONTHLY':
      d.setMonth(d.getMonth() + 1, 1)
      d.setHours(8, 0, 0, 0)
      break
  }
  return d
}

function frequencyToCron(frequency: Frequency): string {
  return FREQUENCY_CRON[frequency]
}

// ── Widget position validation ────────────────────────────────────────────────

describe('Widget position validation', () => {
  it('accepts a valid position {col:1, row:1}', () => {
    expect(validateWidgetPosition({ col: 1, row: 1 })).toBeNull()
  })

  it('accepts a position with larger col/row values', () => {
    expect(validateWidgetPosition({ col: 3, row: 5 })).toBeNull()
  })

  it('rejects col < 1', () => {
    expect(validateWidgetPosition({ col: 0, row: 1 })).toBe('col must be a positive integer')
  })

  it('rejects non-integer col', () => {
    expect(validateWidgetPosition({ col: 1.5, row: 1 })).toBe('col must be an integer')
  })

  it('rejects missing position object', () => {
    expect(validateWidgetPosition(null)).toBe('Position must be an object')
  })
})

// ── Schedule next-run calculation ─────────────────────────────────────────────

describe('Schedule next-run calculation', () => {
  it('DAILY next run is the following day at 08:00', () => {
    const from = new Date('2024-06-10T14:00:00.000Z')
    const next = calcNextRun('DAILY', from)
    expect(next.getHours()).toBe(8)
    expect(next.getDate()).toBe(from.getDate() + 1)
  })

  it('MONTHLY next run is the 1st of the following month at 08:00', () => {
    const from = new Date('2024-06-15T10:00:00.000Z')
    const next = calcNextRun('MONTHLY', from)
    expect(next.getMonth()).toBe(from.getMonth() + 1)
    expect(next.getDate()).toBe(1)
    expect(next.getHours()).toBe(8)
  })

  it('next run is always in the future relative to from', () => {
    const from = new Date()
    expect(calcNextRun('DAILY', from).getTime()).toBeGreaterThan(from.getTime())
    expect(calcNextRun('WEEKLY', from).getTime()).toBeGreaterThan(from.getTime())
    expect(calcNextRun('MONTHLY', from).getTime()).toBeGreaterThan(from.getTime())
  })
})

// ── Report type validation ─────────────────────────────────────────────────────

describe('Report type validation', () => {
  it('accepts all valid report types', () => {
    for (const rt of VALID_REPORT_TYPES) {
      expect(validateReportType(rt)).toBeNull()
    }
  })

  it('rejects an unknown report type', () => {
    expect(validateReportType('EXPENSES')).not.toBeNull()
  })

  it('rejects null/undefined reportType', () => {
    expect(validateReportType(null)).toBe('reportType is required')
  })
})

// ── Widget config schema validation ───────────────────────────────────────────

describe('Widget config schema validation', () => {
  it('accepts a plain object config', () => {
    expect(validateWidgetConfig({ limit: 5, showChart: true })).toBeNull()
  })

  it('accepts undefined/null (config is optional)', () => {
    expect(validateWidgetConfig(undefined)).toBeNull()
    expect(validateWidgetConfig(null)).toBeNull()
  })

  it('rejects an array as config', () => {
    expect(validateWidgetConfig([1, 2, 3])).toBe('config must be a plain object')
  })
})

// ── Frequency to cron mapping ──────────────────────────────────────────────────

describe('Frequency to cron mapping', () => {
  it('DAILY maps to daily at 08:00', () => {
    expect(frequencyToCron('DAILY')).toBe('0 8 * * *')
  })

  it('WEEKLY maps to Monday at 08:00', () => {
    expect(frequencyToCron('WEEKLY')).toBe('0 8 * * 1')
  })

  it('MONTHLY maps to 1st of month at 08:00', () => {
    expect(frequencyToCron('MONTHLY')).toBe('0 8 1 * *')
  })

  it('all frequencies have a cron mapping', () => {
    for (const f of VALID_FREQUENCIES) {
      expect(frequencyToCron(f)).toBeTruthy()
    }
  })
})
