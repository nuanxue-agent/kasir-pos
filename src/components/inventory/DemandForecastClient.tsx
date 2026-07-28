'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import {
  TrendingUp,
  BarChart2,
  Plus,
  RefreshCw,
  Target,
  ChevronDown,
  ChevronUp,
  Loader2,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// Re-export pure logic for unit tests
export {
  calcMovingAverage,
  calcExponentialSmoothing,
  calcLinearTrend,
  calcMAPE,
  calcConfidenceInterval,
  calcStdDev,
  projectMovingAverage,
  projectExponentialSmoothing,
  projectLinearTrend,
} from '@/lib/demand-forecast'

// Dynamic recharts imports
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const Legend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })
const ReferenceLine = dynamic(() => import('recharts').then(m => m.ReferenceLine), { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
}

interface ForecastModel {
  id: string
  storeId: string
  productId: string
  productName: string | null
  method: 'MOVING_AVG' | 'EXPONENTIAL' | 'LINEAR_TREND'
  windowDays: number
  alpha: number
  lastTrainedAt: string | null
  createdAt: string
}

interface ForecastPoint {
  date: string
  predictedQty: number
  confidenceLow: number
  confidenceHigh: number
}

interface ForecastResult {
  modelId: string
  method: string
  horizonDays: number
  pointsGenerated: number
  forecast: ForecastPoint[]
}

interface AccuracyRow {
  modelId: string
  productId: string
  productName: string | null
  method: string
  evaluatedPeriods: number
  mape: number
  accuracy: number | null
}

interface Props {
  storeId: string
  products: Product[]
}

const METHOD_LABELS: Record<string, string> = {
  MOVING_AVG: 'Moving Average',
  EXPONENTIAL: 'Exponential Smoothing',
  LINEAR_TREND: 'Linear Trend',
}

const METHOD_COLORS: Record<string, string> = {
  MOVING_AVG: '#3b82f6',
  EXPONENTIAL: '#8b5cf6',
  LINEAR_TREND: '#10b981',
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DemandForecastClient({ storeId, products }: Props) {
  const qc = useQueryClient()
  const [showAddModel, setShowAddModel] = useState(false)
  const [expandedModel, setExpandedModel] = useState<string | null>(null)
  const [forecastResults, setForecastResults] = useState<Record<string, ForecastResult>>({})
  const [activeTab, setActiveTab] = useState<'models' | 'accuracy'>('models')

  // Form state
  const [formProductId, setFormProductId] = useState('')
  const [formMethod, setFormMethod] = useState<'MOVING_AVG' | 'EXPONENTIAL' | 'LINEAR_TREND'>('MOVING_AVG')
  const [formWindowDays, setFormWindowDays] = useState(7)
  const [formAlpha, setFormAlpha] = useState(0.3)
  const [formHorizonDays, setFormHorizonDays] = useState(30)

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: models = [], isLoading: loadingModels } = useQuery<ForecastModel[]>({
    queryKey: ['demand-forecast-models', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/demand-forecast?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch models')
      return (await res.json()) as ForecastModel[]
    },
  })

  const { data: accuracy = [], isLoading: loadingAccuracy } = useQuery<AccuracyRow[]>({
    queryKey: ['demand-forecast-accuracy', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/demand-forecast/accuracy?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch accuracy')
      return (await res.json()) as AccuracyRow[]
    },
    enabled: activeTab === 'accuracy',
  })

  // ── Mutations ────────────────────────────────────────────────────────────────

  const createModel = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/demand-forecast?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: formProductId,
          method: formMethod,
          windowDays: formWindowDays,
          alpha: formAlpha,
        }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      toast.success('Forecast model created')
      qc.invalidateQueries({ queryKey: ['demand-forecast-models', storeId] })
      setShowAddModel(false)
      setFormProductId('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const runForecast = useCallback(async (modelId: string) => {
    const res = await fetch(`/api/demand-forecast/${modelId}/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horizonDays: formHorizonDays }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    setForecastResults(prev => ({ ...prev, [modelId]: json as ForecastResult }))
    qc.invalidateQueries({ queryKey: ['demand-forecast-models', storeId] })
    qc.invalidateQueries({ queryKey: ['demand-forecast-accuracy', storeId] })
    toast.success(`Forecast generated — ${(json as ForecastResult).pointsGenerated} points`)
  }, [formHorizonDays, storeId, qc])

  // ── Chart data ───────────────────────────────────────────────────────────────

  const buildChartData = (result: ForecastResult) =>
    result.forecast.map(pt => ({
      date: pt.date.slice(5), // MM-DD
      predicted: pt.predictedQty,
      low: pt.confidenceLow,
      high: pt.confidenceHigh,
    }))

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)] flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-[var(--primary)]" />
            Demand Forecasting
          </h1>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Predict future sales using moving average, exponential smoothing, or linear trend
          </p>
        </div>
        <button
          onClick={() => setShowAddModel(v => !v)}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Model
        </button>
      </div>

      {/* Add model form */}
      {showAddModel && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4">
          <h2 className="font-semibold text-[var(--text-1)]">Create Forecast Model</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Product</label>
              <select
                value={formProductId}
                onChange={e => setFormProductId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
              >
                <option value="">Select product…</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-2)]">Method</label>
              <select
                value={formMethod}
                onChange={e => setFormMethod(e.target.value as any)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
              >
                <option value="MOVING_AVG">7/14/30-day Moving Average</option>
                <option value="EXPONENTIAL">Exponential Smoothing</option>
                <option value="LINEAR_TREND">Linear Trend</option>
              </select>
            </div>
            {formMethod === 'MOVING_AVG' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Window (days)</label>
                <select
                  value={formWindowDays}
                  onChange={e => setFormWindowDays(Number(e.target.value))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                </select>
              </div>
            )}
            {formMethod === 'EXPONENTIAL' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-2)]">Alpha (0–1)</label>
                <input
                  type="number"
                  min={0.01}
                  max={0.99}
                  step={0.05}
                  value={formAlpha}
                  onChange={e => setFormAlpha(Number(e.target.value))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                />
                <p className="text-xs text-[var(--text-3)]">Higher = more weight on recent data</p>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => createModel.mutate()}
              disabled={!formProductId || createModel.isPending}
              className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {createModel.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Model
            </button>
            <button
              onClick={() => setShowAddModel(false)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-1 w-fit">
        {(['models', 'accuracy'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors capitalize',
              activeTab === tab
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
            )}
          >
            {tab === 'models' ? 'Forecast Models' : 'Accuracy (MAPE)'}
          </button>
        ))}
      </div>

      {/* Forecast horizon selector */}
      {activeTab === 'models' && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-[var(--text-2)]">Forecast horizon:</span>
          {[7, 14, 30, 60, 90].map(d => (
            <button
              key={d}
              onClick={() => setFormHorizonDays(d)}
              className={cn(
                'rounded-md px-3 py-1 border transition-colors',
                formHorizonDays === d
                  ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                  : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--primary)]'
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      )}

      {/* Models list */}
      {activeTab === 'models' && (
        <div className="space-y-3">
          {loadingModels && (
            <div className="flex items-center justify-center py-12 text-[var(--text-3)]">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading models…
            </div>
          )}
          {!loadingModels && models.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center text-[var(--text-3)]">
              <BarChart2 className="mx-auto h-10 w-10 mb-3 opacity-40" />
              <p className="font-medium">No forecast models yet</p>
              <p className="text-sm mt-1">Create a model to start predicting demand</p>
            </div>
          )}
          {models.map(model => {
            const result = forecastResults[model.id]
            const isExpanded = expandedModel === model.id
            const chartData = result ? buildChartData(result) : []
            const methodColor = METHOD_COLORS[model.method] ?? '#6b7280'

            return (
              <div
                key={model.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden"
              >
                {/* Model header */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                      style={{ background: methodColor }}
                    >
                      {METHOD_LABELS[model.method]}
                    </span>
                    <div>
                      <p className="font-medium text-[var(--text-1)]">
                        {model.productName ?? model.productId}
                      </p>
                      <p className="text-xs text-[var(--text-3)]">
                        {model.method === 'MOVING_AVG' && `Window: ${model.windowDays} days`}
                        {model.method === 'EXPONENTIAL' && `Alpha: ${model.alpha}`}
                        {model.method === 'LINEAR_TREND' && 'OLS linear regression'}
                        {model.lastTrainedAt && ` · Last trained: ${model.lastTrainedAt.slice(0, 10)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => runForecast(model.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-1)] hover:bg-[var(--bg-2)] transition-colors"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Run Forecast
                    </button>
                    {result && (
                      <button
                        onClick={() => setExpandedModel(isExpanded ? null : model.id)}
                        className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-2)] hover:bg-[var(--bg-2)]"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Forecast chart */}
                {isExpanded && result && chartData.length > 0 && (
                  <div className="border-t border-[var(--border)] px-5 py-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[var(--text-1)]">
                        {result.pointsGenerated}-day Forecast
                      </h3>
                      <div className="flex items-center gap-4 text-xs text-[var(--text-3)]">
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-2 w-6 rounded" style={{ background: methodColor }} />
                          Predicted
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-2 w-6 rounded bg-[var(--border)]" />
                          95% CI
                        </span>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                          interval={Math.floor(chartData.length / 6)}
                        />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} width={40} />
                        <Tooltip
                          contentStyle={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(v: any) => [Number(v).toFixed(1), '']}
                        />
                        <Line
                          type="monotone"
                          dataKey="high"
                          stroke="var(--border)"
                          strokeWidth={1}
                          dot={false}
                          strokeDasharray="4 4"
                          name="CI High"
                        />
                        <Line
                          type="monotone"
                          dataKey="low"
                          stroke="var(--border)"
                          strokeWidth={1}
                          dot={false}
                          strokeDasharray="4 4"
                          name="CI Low"
                        />
                        <Line
                          type="monotone"
                          dataKey="predicted"
                          stroke={methodColor}
                          strokeWidth={2}
                          dot={false}
                          name="Predicted Qty"
                        />
                      </LineChart>
                    </ResponsiveContainer>

                    {/* Summary stats */}
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        {
                          label: 'Avg Daily',
                          value: (
                            result.forecast.reduce((s, p) => s + p.predictedQty, 0) /
                            result.forecast.length
                          ).toFixed(1),
                        },
                        {
                          label: 'Total Forecast',
                          value: result.forecast
                            .reduce((s, p) => s + p.predictedQty, 0)
                            .toFixed(0),
                        },
                        {
                          label: 'Peak Day',
                          value: Math.max(...result.forecast.map(p => p.predictedQty)).toFixed(1),
                        },
                        {
                          label: 'CI Width (avg)',
                          value: (
                            result.forecast.reduce(
                              (s, p) => s + (p.confidenceHigh - p.confidenceLow),
                              0
                            ) / result.forecast.length
                          ).toFixed(1),
                        },
                      ].map(stat => (
                        <div
                          key={stat.label}
                          className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-4 py-3"
                        >
                          <p className="text-xs text-[var(--text-3)]">{stat.label}</p>
                          <p className="mt-1 text-lg font-semibold text-[var(--text-1)]">{stat.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Accuracy tab */}
      {activeTab === 'accuracy' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4 flex items-center gap-2">
            <Target className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="font-semibold text-[var(--text-1)]">MAPE Accuracy per Model</h2>
            <span className="text-xs text-[var(--text-3)] ml-1">
              (Mean Absolute Percentage Error — lower is better)
            </span>
          </div>
          {loadingAccuracy ? (
            <div className="flex items-center justify-center py-10 text-[var(--text-3)]">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : accuracy.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-3)]">
              <Activity className="mx-auto h-8 w-8 mb-2 opacity-40" />
              <p>No accuracy data yet — run forecasts and record actuals first</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-2)] text-xs text-[var(--text-3)]">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Product</th>
                  <th className="px-5 py-3 text-left font-medium">Method</th>
                  <th className="px-5 py-3 text-right font-medium">Periods</th>
                  <th className="px-5 py-3 text-right font-medium">MAPE</th>
                  <th className="px-5 py-3 text-right font-medium">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {accuracy.map(row => (
                  <tr key={row.modelId} className="hover:bg-[var(--bg-2)] transition-colors">
                    <td className="px-5 py-3 text-[var(--text-1)]">{row.productName ?? row.productId}</td>
                    <td className="px-5 py-3">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ background: METHOD_COLORS[row.method] ?? '#6b7280' }}
                      >
                        {METHOD_LABELS[row.method] ?? row.method}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-[var(--text-2)]">{row.evaluatedPeriods}</td>
                    <td className="px-5 py-3 text-right font-mono">
                      <span
                        className={cn(
                          'font-semibold',
                          row.mape <= 10
                            ? 'text-green-500'
                            : row.mape <= 20
                            ? 'text-blue-500'
                            : row.mape <= 40
                            ? 'text-yellow-500'
                            : 'text-red-500'
                        )}
                      >
                        {row.mape.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {row.accuracy !== null ? (
                        <span className="font-semibold text-[var(--text-1)]">
                          {row.accuracy.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[var(--text-3)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
