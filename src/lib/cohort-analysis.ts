// Pure business logic for cohort analysis — no DB deps

export interface CohortRow {
  cohortMonth: string   // 'YYYY-MM'
  periodOffset: number  // months since acquisition (0, 1, 2, ...)
  customers: number     // acquired in cohortMonth
  retained: number      // still active at periodOffset
  retentionRate: number // 0–100
  revenue: number
}

export interface CohortGrid {
  cohorts: string[]         // unique cohortMonth values sorted ASC
  periods: number[]         // 0..maxOffset
  cells: Record<string, Record<number, CohortRow>>  // cells[cohortMonth][periodOffset]
}

export interface LTVRow {
  cohortMonth: string
  customers: number
  cumulativeRevenue: number
  ltv: number              // cumulativeRevenue / customers
  avgMonthlyRevenue: number
}

export interface ChurnPoint {
  cohortMonth: string
  periodOffset: number
  churnRate: number   // 0–100; churn = 1 - retentionRate
}

// --- Retention rate ---
export function calcRetentionRate(retained: number, originalCohortSize: number): number {
  if (originalCohortSize <= 0) return 0
  return Math.min(100, Math.max(0, (retained / originalCohortSize) * 100))
}

// --- Cohort month grouping ---
// Given an ISO date string, returns 'YYYY-MM'
export function toCohortMonth(isoDate: string): string {
  const d = new Date(isoDate)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// Returns the month offset (integer) between two 'YYYY-MM' strings
// e.g. periodOffset('2024-01', '2024-03') === 2
export function periodOffset(cohortMonth: string, activeMonth: string): number {
  const [cy, cm] = cohortMonth.split('-').map(Number)
  const [ay, am] = activeMonth.split('-').map(Number)
  return (ay - cy) * 12 + (am - cm)
}

// Group raw order data into cohort rows
export interface RawOrder {
  customerId: string
  createdAt: string   // ISO timestamp
  revenue: number
}

export function groupIntoCohorts(orders: RawOrder[]): CohortRow[] {
  // Step 1: find acquisition month per customer (first order)
  const firstOrder: Record<string, string> = {}
  for (const o of orders) {
    const month = toCohortMonth(o.createdAt)
    if (!firstOrder[o.customerId] || month < firstOrder[o.customerId]) {
      firstOrder[o.customerId] = month
    }
  }

  // Step 2: group by (cohortMonth, periodOffset)
  const cellMap: Record<string, Record<number, { customers: Set<string>; retained: Set<string>; revenue: number }>> = {}

  for (const o of orders) {
    const cohortMonth = firstOrder[o.customerId]
    const activeMonth = toCohortMonth(o.createdAt)
    const offset = periodOffset(cohortMonth, activeMonth)
    if (offset < 0) continue

    if (!cellMap[cohortMonth]) cellMap[cohortMonth] = {}
    if (!cellMap[cohortMonth][offset]) {
      cellMap[cohortMonth][offset] = { customers: new Set(), retained: new Set(), revenue: 0 }
    }
    cellMap[cohortMonth][offset].retained.add(o.customerId)
    cellMap[cohortMonth][offset].revenue += o.revenue
  }

  // Step 3: fill offset=0 customer counts
  // firstOrder is keyed by customerId → value is cohortMonth
  for (const [customerId, cohortMonth] of Object.entries(firstOrder)) {
    if (!cellMap[cohortMonth]) cellMap[cohortMonth] = {}
    if (!cellMap[cohortMonth][0]) {
      cellMap[cohortMonth][0] = { customers: new Set(), retained: new Set(), revenue: 0 }
    }
    cellMap[cohortMonth][0].customers.add(customerId)
  }

  // Step 4: flatten
  const rows: CohortRow[] = []
  for (const [cohortMonth, offsets] of Object.entries(cellMap)) {
    const cohortSize = offsets[0]?.customers.size ?? 0
    for (const [offsetStr, cell] of Object.entries(offsets)) {
      const offset = Number(offsetStr)
      const retained = cell.retained.size
      rows.push({
        cohortMonth,
        periodOffset: offset,
        customers: cohortSize,
        retained,
        retentionRate: calcRetentionRate(retained, cohortSize),
        revenue: cell.revenue,
      })
    }
  }

  return rows.sort((a, b) =>
    a.cohortMonth.localeCompare(b.cohortMonth) || a.periodOffset - b.periodOffset,
  )
}

// --- LTV by cohort ---
export function calcLTVByCohort(rows: CohortRow[]): LTVRow[] {
  // Aggregate per cohortMonth
  const map: Record<string, { customers: number; revenue: number; periods: number }> = {}
  for (const r of rows) {
    if (!map[r.cohortMonth]) map[r.cohortMonth] = { customers: r.customers, revenue: 0, periods: 0 }
    map[r.cohortMonth].revenue += r.revenue
    map[r.cohortMonth].periods = Math.max(map[r.cohortMonth].periods, r.periodOffset + 1)
  }

  return Object.entries(map)
    .map(([cohortMonth, { customers, revenue, periods }]) => ({
      cohortMonth,
      customers,
      cumulativeRevenue: revenue,
      ltv: customers > 0 ? revenue / customers : 0,
      avgMonthlyRevenue: customers > 0 && periods > 0 ? revenue / customers / periods : 0,
    }))
    .sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth))
}

// --- Churn rate trend ---
export function calcChurnRates(rows: CohortRow[]): ChurnPoint[] {
  return rows.map(r => ({
    cohortMonth: r.cohortMonth,
    periodOffset: r.periodOffset,
    churnRate: Math.min(100, Math.max(0, 100 - r.retentionRate)),
  }))
}

// --- Heatmap value normalization ---
// Normalizes retentionRate values across all cells to 0–1 for color intensity
export function normalizeHeatmap(rows: CohortRow[]): Array<CohortRow & { normalized: number }> {
  const rates = rows.map(r => r.retentionRate).filter(v => v > 0)
  if (rates.length === 0) return rows.map(r => ({ ...r, normalized: 0 }))
  const min = Math.min(...rates)
  const max = Math.max(...rates)
  const range = max - min
  return rows.map(r => ({
    ...r,
    normalized: range > 0 ? (r.retentionRate - min) / range : r.retentionRate > 0 ? 1 : 0,
  }))
}

// --- Build grid structure for heatmap rendering ---
export function buildCohortGrid(rows: CohortRow[]): CohortGrid {
  const cohortSet = new Set<string>()
  const periodSet = new Set<number>()
  const cells: Record<string, Record<number, CohortRow>> = {}

  for (const r of rows) {
    cohortSet.add(r.cohortMonth)
    periodSet.add(r.periodOffset)
    if (!cells[r.cohortMonth]) cells[r.cohortMonth] = {}
    cells[r.cohortMonth][r.periodOffset] = r
  }

  return {
    cohorts: Array.from(cohortSet).sort(),
    periods: Array.from(periodSet).sort((a, b) => a - b),
    cells,
  }
}
