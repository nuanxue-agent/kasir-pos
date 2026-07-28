'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  ShieldCheck,
  BarChart2,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PrintButton } from '@/components/ui/PrintButton'

// Dynamic recharts imports (keep out of initial bundle)
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), {
  ssr: false,
})

interface FinancialRatiosClientProps {
  storeId: string
  currency: string
}

interface FinancialRatios {
  currentRatio: number
  quickRatio: number
  grossMarginPct: number
  netMarginPct: number
  inventoryTurnover: number
  receivablesTurnover: number
  debtRatio: number
  healthScore: number
  revenue: number
  cogs: number
  netIncome: number
}

interface RatioTrendPoint {
  month: string
  currentRatio: number
  quickRatio: number
  grossMarginPct: number
  netMarginPct: number
  inventoryTurnover: number
  receivablesTurnover: number
  debtRatio: number
}

interface BenchmarkData {
  ratio: string
  label: string
  industryAvg: number
  industryMin: number
  industryMax: number
  unit: string
  higherIsBetter: boolean
  description: string
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

export function calcHealthScore(ratios: {
  currentRatio: number
  grossMarginPct: number
  netMarginPct: number
  inventoryTurnover: number
  debtRatio: number
}): number {
  const liquidityScore = Math.min(100, Math.max(0, (ratios.currentRatio / 2) * 100))
  const grossMarginScore = Math.min(100, Math.max(0, ratios.grossMarginPct * 2))
  const netMarginScore = Math.min(100, Math.max(0, (ratios.netMarginPct + 5) * 5))
  const efficiencyScore = Math.min(100, Math.max(0, (ratios.inventoryTurnover / 12) * 100))
  const leverageScore = Math.min(100, Math.max(0, (1 - ratios.debtRatio) * 100))

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

type Period = 'month' | 'quarter' | 'year'

function healthLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Excellent', color: 'text-green-500' }
  if (score >= 60) return { label: 'Good', color: 'text-blue-500' }
  if (score >= 40) return { label: 'Fair', color: 'text-yellow-500' }
  return { label: 'At Risk', color: 'text-red-500' }
}

function healthRingColor(score: number): string {
  if (score >= 80) return '#22c55e'
  if (score >= 60) return '#3b82f6'
  if (score >= 40) return '#eab308'
  return '#ef4444'
}

function TrendIcon({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up') return <TrendingUp className="h-4 w-4 text-green-500" />
  if (direction === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />
  return <Minus className="h-4 w-4 text-[var(--text-3)]" />
}

function Sparkline({
  data,
  dataKey,
  color,
}: {
  data: RatioTrendPoint[]
  dataKey: keyof RatioTrendPoint
  color: string
}) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey={dataKey as string}
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(v: any) => String(v)}
          labelFormatter={() => ''}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

interface RatioCardProps {
  title: string
  value: number
  unit: string
  trend: RatioTrendPoint[]
  dataKey: keyof RatioTrendPoint
  benchmark?: BenchmarkData
  higherIsBetter?: boolean
  color: string
  description: string
}

function RatioCard({
  title,
  value,
  unit,
  trend,
  dataKey,
  benchmark,
  higherIsBetter = true,
  color,
  description,
}: RatioCardProps) {
  const trendValues = trend.map(t => t[dataKey] as number)
  const direction = detectTrendDirection(trendValues)
  const vsAvg = benchmark ? value - benchmark.industryAvg : null
  const isGood = vsAvg !== null ? (higherIsBetter ? vsAvg >= 0 : vsAvg <= 0) : null

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-[var(--text-3)] uppercase">
            {title}
          </p>
          <p className="mt-0.5 text-2xl font-bold text-[var(--text-1)]">
            {isFinite(value) ? value.toFixed(2) : '—'}
            <span className="ml-1 text-sm font-normal text-[var(--text-3)]">{unit}</span>
          </p>
        </div>
        <TrendIcon direction={direction} />
      </div>

      {/* Sparkline */}
      <div className="h-10">
        <Sparkline data={trend} dataKey={dataKey} color={color} />
      </div>

      {/* Benchmark */}
      {benchmark && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--text-3)]">
            Industry avg: {benchmark.industryAvg}
            {unit}
          </span>
          {isGood !== null && (
            <span className={cn('font-medium', isGood ? 'text-green-500' : 'text-red-500')}>
              {isGood ? '▲ Above avg' : '▼ Below avg'}
            </span>
          )}
        </div>
      )}

      <p className="text-xs leading-relaxed text-[var(--text-3)]">{description}</p>
    </div>
  )
}

// Health score radial gauge (SVG)
function HealthGauge({ score }: { score: number }) {
  const r = 54
  const circ = 2 * Math.PI * r
  const arc = (score / 100) * circ
  const { label, color } = healthLabel(score)
  const ringColor = healthRingColor(score)

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={136} height={136} viewBox="0 0 136 136">
        {/* track */}
        <circle cx={68} cy={68} r={r} fill="none" stroke="var(--border)" strokeWidth={10} />
        {/* progress */}
        <circle
          cx={68}
          cy={68}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={10}
          strokeDasharray={`${arc} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 68 68)"
        />
        <text x={68} y={62} textAnchor="middle" fontSize={28} fontWeight="bold" fill={ringColor}>
          {score}
        </text>
        <text x={68} y={80} textAnchor="middle" fontSize={11} fill="var(--text-3)">
          / 100
        </text>
      </svg>
      <span className={cn('text-lg font-bold', color)}>{label}</span>
      <span className="text-xs text-[var(--text-3)]">Business Health Score</span>
    </div>
  )
}

export default function FinancialRatiosClient({ storeId }: FinancialRatiosClientProps) {
  const [period, setPeriod] = useState<Period>('month')

  const { data: ratios, isLoading: ratiosLoading } = useQuery<FinancialRatios>({
    queryKey: ['financial-ratios', storeId, period],
    queryFn: async () => {
      const res = await fetch(`/api/reports/financial-ratios?storeId=${storeId}&period=${period}`)
      if (!res.ok) throw new Error('Failed to fetch ratios')
      return (await res.json()) as FinancialRatios
    },
  })

  const { data: trends = [], isLoading: trendsLoading } = useQuery<RatioTrendPoint[]>({
    queryKey: ['financial-ratios-trends', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/financial-ratios/trends?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch trends')
      return (await res.json()) as RatioTrendPoint[]
    },
  })

  const { data: benchmarks = [] } = useQuery<BenchmarkData[]>({
    queryKey: ['financial-ratios-benchmarks'],
    queryFn: async () => {
      const res = await fetch('/api/reports/financial-ratios/benchmark')
      if (!res.ok) throw new Error('Failed to fetch benchmarks')
      return (await res.json()) as BenchmarkData[]
    },
  })

  const bm = (ratio: string) => benchmarks.find(b => b.ratio === ratio)

  const isLoading = ratiosLoading || trendsLoading

  const ratioCards: Array<{
    key: keyof RatioTrendPoint
    title: string
    unit: string
    color: string
    higherIsBetter: boolean
    description: string
  }> = [
    {
      key: 'currentRatio',
      title: 'Current Ratio',
      unit: 'x',
      color: '#3b82f6',
      higherIsBetter: true,
      description: 'Ability to cover short-term liabilities with current assets.',
    },
    {
      key: 'quickRatio',
      title: 'Quick Ratio',
      unit: 'x',
      color: '#8b5cf6',
      higherIsBetter: true,
      description: 'Liquidity excluding inventory — most conservative measure.',
    },
    {
      key: 'grossMarginPct',
      title: 'Gross Margin',
      unit: '%',
      color: '#22c55e',
      higherIsBetter: true,
      description: 'Revenue minus cost of goods as a % of revenue.',
    },
    {
      key: 'netMarginPct',
      title: 'Net Margin',
      unit: '%',
      color: '#10b981',
      higherIsBetter: true,
      description: 'Bottom-line profitability after all expenses.',
    },
    {
      key: 'inventoryTurnover',
      title: 'Inventory Turnover',
      unit: 'x',
      color: '#f59e0b',
      higherIsBetter: true,
      description: 'How often inventory is sold and replaced per year.',
    },
    {
      key: 'receivablesTurnover',
      title: 'Receivables Turnover',
      unit: 'x',
      color: '#06b6d4',
      higherIsBetter: true,
      description: 'How quickly receivables convert to cash.',
    },
    {
      key: 'debtRatio',
      title: 'Debt Ratio',
      unit: 'x',
      color: '#ef4444',
      higherIsBetter: false,
      description: 'Proportion of assets financed by debt. Lower is safer.',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Financial Ratios</h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">
            Key financial health metrics with industry benchmarks
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
            {(['month', 'quarter', 'year'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                  period === p
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--text-2)] hover:bg-[var(--bg-2)]',
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <PrintButton />
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-[var(--text-3)]">
          <Activity className="mr-2 h-5 w-5 animate-pulse" />
          Loading financial data…
        </div>
      ) : (
        <>
          {/* Health score + summary strip */}
          <div className="flex flex-wrap items-center gap-8 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
            <HealthGauge score={ratios?.healthScore ?? 0} />

            <div className="grid min-w-0 flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-xs text-[var(--text-3)]">
                  <ShieldCheck className="h-3.5 w-3.5" /> Liquidity
                </span>
                <span className="text-lg font-bold text-[var(--text-1)]">
                  {ratios?.currentRatio.toFixed(2)}x
                </span>
                <span className="text-xs text-[var(--text-3)]">Current Ratio</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-xs text-[var(--text-3)]">
                  <TrendingUp className="h-3.5 w-3.5" /> Profitability
                </span>
                <span className="text-lg font-bold text-[var(--text-1)]">
                  {ratios?.grossMarginPct.toFixed(1)}%
                </span>
                <span className="text-xs text-[var(--text-3)]">Gross Margin</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-xs text-[var(--text-3)]">
                  <Zap className="h-3.5 w-3.5" /> Efficiency
                </span>
                <span className="text-lg font-bold text-[var(--text-1)]">
                  {ratios?.inventoryTurnover.toFixed(1)}x
                </span>
                <span className="text-xs text-[var(--text-3)]">Inv. Turnover</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-xs text-[var(--text-3)]">
                  <BarChart2 className="h-3.5 w-3.5" /> Leverage
                </span>
                <span className="text-lg font-bold text-[var(--text-1)]">
                  {ratios?.debtRatio.toFixed(2)}x
                </span>
                <span className="text-xs text-[var(--text-3)]">Debt Ratio</span>
              </div>
            </div>
          </div>

          {/* Category sections */}
          {[
            {
              label: 'Liquidity',
              icon: <ShieldCheck className="h-4 w-4" />,
              keys: ['currentRatio', 'quickRatio'],
            },
            {
              label: 'Profitability',
              icon: <TrendingUp className="h-4 w-4" />,
              keys: ['grossMarginPct', 'netMarginPct'],
            },
            {
              label: 'Efficiency',
              icon: <Zap className="h-4 w-4" />,
              keys: ['inventoryTurnover', 'receivablesTurnover'],
            },
            {
              label: 'Leverage',
              icon: <BarChart2 className="h-4 w-4" />,
              keys: ['debtRatio'],
            },
          ].map(section => (
            <div key={section.label} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wider text-[var(--text-2)] uppercase">
                {section.icon}
                {section.label}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.keys.map(key => {
                  const card = ratioCards.find(c => c.key === key)
                  if (!card || !ratios) return null
                  return (
                    <RatioCard
                      key={key}
                      title={card.title}
                      value={ratios[key as keyof FinancialRatios] as number}
                      unit={card.unit}
                      trend={trends}
                      dataKey={card.key}
                      benchmark={bm(key)}
                      higherIsBetter={card.higherIsBetter}
                      color={card.color}
                      description={card.description}
                    />
                  )
                })}
              </div>
            </div>
          ))}

          {/* Benchmark table */}
          {benchmarks.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
              <div className="border-b border-[var(--border)] px-4 py-3">
                <h2 className="text-sm font-semibold text-[var(--text-1)]">
                  Industry Benchmark Comparison
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-3)]">
                  SMB retail averages (Indonesian market)
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--text-3)]">
                      <th className="px-4 py-2 text-left font-medium">Ratio</th>
                      <th className="px-4 py-2 text-right font-medium">Your Value</th>
                      <th className="px-4 py-2 text-right font-medium">Industry Avg</th>
                      <th className="px-4 py-2 text-right font-medium">Range</th>
                      <th className="px-4 py-2 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarks.map(b => {
                      const yours = ratios?.[b.ratio as keyof FinancialRatios] as number | undefined
                      const delta = yours != null ? yours - b.industryAvg : null
                      const isGood =
                        delta !== null ? (b.higherIsBetter ? delta >= 0 : delta <= 0) : null
                      return (
                        <tr
                          key={b.ratio}
                          className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--bg-2)]"
                        >
                          <td className="px-4 py-2.5 font-medium text-[var(--text-1)]">
                            {b.label}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--text-1)]">
                            {yours != null ? yours.toFixed(2) : '—'}
                            {b.unit}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--text-2)]">
                            {b.industryAvg}
                            {b.unit}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-[var(--text-3)]">
                            {b.industryMin}–{b.industryMax}
                            {b.unit}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {isGood !== null && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                                  isGood
                                    ? 'bg-green-500/10 text-green-500'
                                    : 'bg-red-500/10 text-red-500',
                                )}
                              >
                                {isGood ? '▲ Above' : '▼ Below'}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
