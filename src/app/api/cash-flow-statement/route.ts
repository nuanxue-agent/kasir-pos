import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureCashFlowTables, CashFlowCategory, CashFlowEntry } from '../cash-flow-entries/route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export interface CashFlowSection {
  category: CashFlowCategory
  label: string
  inflows: { id: string; description: string; amount: number; reference: string | null }[]
  outflows: { id: string; description: string; amount: number; reference: string | null }[]
  totalInflow: number
  totalOutflow: number
  net: number
}

export interface CashFlowStatementResult {
  period: string
  operating: CashFlowSection
  investing: CashFlowSection
  financing: CashFlowSection
  netCashChange: number
  openingBalance: number
  closingBalance: number
}

const CATEGORY_LABELS: Record<CashFlowCategory, string> = {
  OPERATING: 'Aktivitas Operasi',
  INVESTING: 'Aktivitas Investasi',
  FINANCING: 'Aktivitas Pendanaan',
}

function buildSection(
  category: CashFlowCategory,
  entries: CashFlowEntry[],
): CashFlowSection {
  const catEntries = entries.filter(e => e.category === category)
  const inflows = catEntries
    .filter(e => e.type === 'INFLOW')
    .map(e => ({ id: e.id, description: e.description, amount: e.amount, reference: e.reference }))
  const outflows = catEntries
    .filter(e => e.type === 'OUTFLOW')
    .map(e => ({ id: e.id, description: e.description, amount: e.amount, reference: e.reference }))
  const totalInflow = inflows.reduce((s, e) => s + e.amount, 0)
  const totalOutflow = outflows.reduce((s, e) => s + e.amount, 0)
  return {
    category,
    label: CATEGORY_LABELS[category],
    inflows,
    outflows,
    totalInflow,
    totalOutflow,
    net: totalInflow - totalOutflow,
  }
}

// GET /api/cash-flow-statement?storeId=&period=&openingBalance=
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  const period = req.nextUrl.searchParams.get('period')
  if (!period) return err('period required (YYYY-MM)', 400, 'MISSING_FIELD')

  const openingBalance = parseFloat(req.nextUrl.searchParams.get('openingBalance') ?? '0') || 0

  await ensureCashFlowTables()

  const rows = await query(
    `SELECT * FROM CashFlowEntry WHERE storeId = ? AND period = ? ORDER BY createdAt ASC`,
    [storeId, period]
  ) as CashFlowEntry[]

  const operating = buildSection('OPERATING', rows)
  const investing = buildSection('INVESTING', rows)
  const financing = buildSection('FINANCING', rows)
  const netCashChange = operating.net + investing.net + financing.net
  const closingBalance = openingBalance + netCashChange

  const result: CashFlowStatementResult = {
    period,
    operating,
    investing,
    financing,
    netCashChange,
    openingBalance,
    closingBalance,
  }

  return NextResponse.json(result)
}
