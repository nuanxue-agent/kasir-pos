// API route: GET /api/reports/financial-ratios
// Computes all financial ratios for a store and period
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export interface FinancialRatios {
  // Liquidity
  currentRatio: number
  quickRatio: number
  // Profitability
  grossMarginPct: number
  netMarginPct: number
  // Efficiency
  inventoryTurnover: number
  receivablesTurnover: number
  // Leverage
  debtRatio: number
  // Health
  healthScore: number
  // Raw inputs
  currentAssets: number
  currentLiabilities: number
  inventory: number
  revenue: number
  cogs: number
  netIncome: number
  totalAssets: number
  totalDebt: number
  accountsReceivable: number
}

// ── Pure business logic (exported for unit tests) ────────────────────────────

export function calcCurrentRatio(currentAssets: number, currentLiabilities: number): number {
  if (currentLiabilities === 0) return Infinity
  return currentAssets / currentLiabilities
}

export function calcQuickRatio(
  currentAssets: number,
  inventory: number,
  currentLiabilities: number,
): number {
  if (currentLiabilities === 0) return Infinity
  return (currentAssets - inventory) / currentLiabilities
}

export function calcGrossMarginPct(revenue: number, cogs: number): number {
  if (revenue === 0) return 0
  return ((revenue - cogs) / revenue) * 100
}

export function calcNetMarginPct(revenue: number, netIncome: number): number {
  if (revenue === 0) return 0
  return (netIncome / revenue) * 100
}

export function calcInventoryTurnover(cogs: number, avgInventory: number): number {
  if (avgInventory === 0) return 0
  return cogs / avgInventory
}

export function calcReceivablesTurnover(revenue: number, avgReceivables: number): number {
  if (avgReceivables === 0) return 0
  return revenue / avgReceivables
}

export function calcDebtRatio(totalDebt: number, totalAssets: number): number {
  if (totalAssets === 0) return 0
  return totalDebt / totalAssets
}

/** Weighted composite health score 0–100 */
export function calcHealthScore(ratios: {
  currentRatio: number
  grossMarginPct: number
  netMarginPct: number
  inventoryTurnover: number
  debtRatio: number
}): number {
  // Score each ratio 0–100 based on industry benchmarks for SMB retail
  const liquidityScore = Math.min(100, Math.max(0, (ratios.currentRatio / 2) * 100))
  const grossMarginScore = Math.min(100, Math.max(0, ratios.grossMarginPct * 2))
  const netMarginScore = Math.min(100, Math.max(0, (ratios.netMarginPct + 5) * 5))
  const efficiencyScore = Math.min(100, Math.max(0, (ratios.inventoryTurnover / 12) * 100))
  const leverageScore = Math.min(100, Math.max(0, (1 - ratios.debtRatio) * 100))

  // Weights: liquidity 25%, gross margin 25%, net margin 20%, efficiency 15%, leverage 15%
  return Math.round(
    liquidityScore * 0.25 +
      grossMarginScore * 0.25 +
      netMarginScore * 0.2 +
      efficiencyScore * 0.15 +
      leverageScore * 0.15,
  )
}

export function detectTrendDirection(values: number[]): 'up' | 'down' | 'flat' {
  if (values.length < 2) return 'flat'
  const first = values[0]
  const last = values[values.length - 1]
  const delta = last - first
  const pct = first !== 0 ? Math.abs(delta / first) : 0
  if (pct < 0.02) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id ?? ''
  if (!storeId) return err('storeId required', 400)

  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period') ?? 'month' // month | quarter | year

  const now = new Date()
  let fromDate: Date
  if (period === 'year') {
    fromDate = new Date(now.getFullYear(), 0, 1)
  } else if (period === 'quarter') {
    fromDate = new Date(now)
    fromDate.setMonth(now.getMonth() - 3)
  } else {
    fromDate = new Date(now)
    fromDate.setMonth(now.getMonth() - 1)
  }
  const fromISO = fromDate.toISOString()

  try {
    // Revenue & COGS from completed orders
    const salesRows = await query<any>(
      `SELECT
         COALESCE(SUM(oi.price * oi.qty), 0) as revenue,
         COALESCE(SUM(p.cost * oi.qty), 0)   as cogs
       FROM OrderItem oi
       JOIN Orders o ON oi.orderId = o.id
       JOIN Product p ON oi.productId = p.id
       WHERE o.storeId = ? AND o.status = 'completed' AND o.createdAt >= ?`,
      [storeId, fromISO],
    ).catch(() => [{ revenue: 0, cogs: 0 }])

    const revenue = Number((salesRows[0] as any)?.revenue ?? 0)
    const cogs = Number((salesRows[0] as any)?.cogs ?? 0)

    // Inventory value (current)
    const invRows = await query<any>(
      `SELECT COALESCE(SUM(p.cost * p.stock), 0) as inventoryValue
       FROM Product p
       WHERE p.storeId = ? AND (p.active = 1 OR p.active IS NULL)`,
      [storeId],
    ).catch(() => [{ inventoryValue: 0 }])
    const inventory = Number((invRows[0] as any)?.inventoryValue ?? 0)

    // Expenses (operating costs)
    const expRows = await query<any>(
      `SELECT COALESCE(SUM(amount), 0) as totalExpenses
       FROM Expense
       WHERE storeId = ? AND createdAt >= ?`,
      [storeId, fromISO],
    ).catch(() => [{ totalExpenses: 0 }])
    const totalExpenses = Number((expRows[0] as any)?.totalExpenses ?? 0)

    // Accounts receivable proxy (unpaid supplier invoices)
    const arRows = await query<any>(
      `SELECT COALESCE(SUM(amount), 0) as arTotal
       FROM SupplierInvoice
       WHERE storeId = ? AND status = 'PENDING'`,
      [storeId],
    ).catch(() => [{ arTotal: 0 }])
    const accountsReceivable = Number((arRows[0] as any)?.arTotal ?? 0)

    // Derived balance sheet proxies
    const currentAssets = revenue * 0.3 + inventory + accountsReceivable
    const currentLiabilities = Math.max(totalExpenses * 0.5, 1)
    const totalAssets = currentAssets + inventory * 2
    const totalDebt = totalExpenses * 0.4
    const netIncome = revenue - cogs - totalExpenses

    const currentRatio = calcCurrentRatio(currentAssets, currentLiabilities)
    const quickRatio = calcQuickRatio(currentAssets, inventory, currentLiabilities)
    const grossMarginPct = calcGrossMarginPct(revenue, cogs)
    const netMarginPct = calcNetMarginPct(revenue, netIncome)
    const inventoryTurnover = calcInventoryTurnover(cogs, inventory)
    const receivablesTurnover = calcReceivablesTurnover(revenue, accountsReceivable)
    const debtRatio = calcDebtRatio(totalDebt, totalAssets)

    const healthScore = calcHealthScore({
      currentRatio: isFinite(currentRatio) ? currentRatio : 2,
      grossMarginPct,
      netMarginPct,
      inventoryTurnover,
      debtRatio,
    })

    const result: FinancialRatios = {
      currentRatio: isFinite(currentRatio) ? Math.round(currentRatio * 100) / 100 : 99,
      quickRatio: isFinite(quickRatio) ? Math.round(quickRatio * 100) / 100 : 99,
      grossMarginPct: Math.round(grossMarginPct * 100) / 100,
      netMarginPct: Math.round(netMarginPct * 100) / 100,
      inventoryTurnover: Math.round(inventoryTurnover * 100) / 100,
      receivablesTurnover: Math.round(receivablesTurnover * 100) / 100,
      debtRatio: Math.round(debtRatio * 100) / 100,
      healthScore,
      currentAssets,
      currentLiabilities,
      inventory,
      revenue,
      cogs,
      netIncome,
      totalAssets,
      totalDebt,
      accountsReceivable,
    }

    return NextResponse.json(result)
  } catch (e: any) {
    return err(e.message ?? 'Failed to compute ratios', 500)
  }
}
