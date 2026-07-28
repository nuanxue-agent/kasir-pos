// API route: GET /api/reports/financial-ratios/benchmark
// Returns industry average benchmarks for SMB retail (Indonesian market)
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export interface BenchmarkData {
  ratio: string
  label: string
  industryAvg: number
  industryMin: number
  industryMax: number
  unit: string
  higherIsBetter: boolean
  description: string
}

// SMB retail benchmarks (Indonesian market context)
const BENCHMARKS: BenchmarkData[] = [
  {
    ratio: 'currentRatio',
    label: 'Current Ratio',
    industryAvg: 1.8,
    industryMin: 1.2,
    industryMax: 3.0,
    unit: 'x',
    higherIsBetter: true,
    description: 'Current assets divided by current liabilities. >1.5 is healthy.',
  },
  {
    ratio: 'quickRatio',
    label: 'Quick Ratio',
    industryAvg: 1.1,
    industryMin: 0.8,
    industryMax: 2.0,
    unit: 'x',
    higherIsBetter: true,
    description: 'Liquid assets divided by current liabilities. >1.0 is safe.',
  },
  {
    ratio: 'grossMarginPct',
    label: 'Gross Margin',
    industryAvg: 35,
    industryMin: 20,
    industryMax: 55,
    unit: '%',
    higherIsBetter: true,
    description: 'Revenue minus COGS as a percentage of revenue.',
  },
  {
    ratio: 'netMarginPct',
    label: 'Net Margin',
    industryAvg: 8,
    industryMin: 3,
    industryMax: 20,
    unit: '%',
    higherIsBetter: true,
    description: 'Net income as a percentage of revenue.',
  },
  {
    ratio: 'inventoryTurnover',
    label: 'Inventory Turnover',
    industryAvg: 8,
    industryMin: 4,
    industryMax: 15,
    unit: 'x/yr',
    higherIsBetter: true,
    description: 'How many times inventory is sold and replaced per year.',
  },
  {
    ratio: 'receivablesTurnover',
    label: 'Receivables Turnover',
    industryAvg: 10,
    industryMin: 6,
    industryMax: 20,
    unit: 'x/yr',
    higherIsBetter: true,
    description: 'How quickly receivables are collected.',
  },
  {
    ratio: 'debtRatio',
    label: 'Debt Ratio',
    industryAvg: 0.4,
    industryMin: 0.1,
    industryMax: 0.65,
    unit: 'x',
    higherIsBetter: false,
    description: 'Total debt divided by total assets. <0.5 is considered safe.',
  },
]

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  return NextResponse.json(BENCHMARKS)
}
