'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Clock,
  Package,
  TrendingDown,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StockAgeItem {
  id: string
  storeId: string
  productId: string
  productName: string
  sku: string | null
  warehouseId: string | null
  warehouseName: string | null
  batchId: string | null
  receivedAt: string
  qty: number
  cost: number
  ageDays: number
  ageBucket: AgeBucket
  agingValue: number
}

export interface StockAgeSummary {
  bucket0_30: { count: number; value: number; qty: number }
  bucket31_60: { count: number; value: number; qty: number }
  bucket61_90: { count: number; value: number; qty: number }
  bucket90plus: { count: number; value: number; qty: number }
  totalValue: number
  totalItems: number
}

export interface SlowMover {
  productId: string
  productName: string
  sku: string | null
  currentStock: number
  unitsSold30d: number
  turnoverRate: number
  avgAgeDays: number
  agingValue: number
  alertLevel: 'LOW' | 'MEDIUM' | 'HIGH'
}

export type AgeBucket = '0-30' | '31-60' | '61-90' | '90+'

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

export function calcAgeDays(receivedAt: string, now = new Date()): number {
  const received = new Date(receivedAt)
  const diffMs = now.getTime() - received.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

export function classifyAgeBucket(ageDays: number): AgeBucket {
  if (ageDays <= 30) return '0-30'
  if (ageDays <= 60) return '31-60'
  if (ageDays <= 90) return '61-90'
  return '90+'
}

export function calcTurnoverRate(unitsSold: number, avgStock: number): number {
  if (avgStock <= 0) return 0
  return unitsSold / avgStock
}

export function isSlowMover(turnoverRate: number, threshold = 0.5): boolean {
  return turnoverRate < threshold
}

export function calcAgingValue(qty: number, cost: number): number {
  return qty * cost
}

export function calcAlertLevel(turnoverRate: number, ageDays: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (turnoverRate === 0 && ageDays > 90) return 'HIGH'
  if (turnoverRate < 0.2 || ageDays > 90) return 'HIGH'
  if (turnoverRate < 0.5 || ageDays > 60) return 'MEDIUM'
  return 'LOW'
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const BUCKET_CONFIG: Record<AgeBucket, { label: string; color: string; bg: string }> = {
  '0-30':  { label: '0–30 days',  color: 'text-green-500',  bg: 'bg-green-500/10' },
  '31-60': { label: '31–60 days', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  '61-90': { label: '61–90 days', color: 'text-orange-500', bg: 'bg-orange-500/10' },
  '90+':   { label: '90+ days',   color: 'text-red-500',    bg: 'bg-red-500/10' },
}

const ALERT_CONFIG = {
  LOW:    { label: 'Low',    color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  MEDIUM: { label: 'Medium', color: 'text-orange-500', bg: 'bg-orange-500/10' },
  HIGH:   { label: 'High',   color: 'text-red-500',    bg: 'bg-red-500/10' },
}

function SummaryCard({
  bucket,
  data,
  currency,
}: {
  bucket: AgeBucket
  data: { count: number; value: number; qty: number }
  currency: string
}) {
  const cfg = BUCKET_CONFIG[bucket]
  return (
    <div className={cn('rounded-xl border p-4', cfg.bg)} style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className={cn('text-sm font-medium', cfg.color)}>{cfg.label}</span>
        <Clock className={cn('w-4 h-4', cfg.color)} />
      </div>
      <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{data.qty.toLocaleString()}</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
        {data.count} batch{data.count !== 1 ? 'es' : ''} · {formatCurrency(data.value, currency)}
      </p>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface StockAgeClientProps {
  storeId: string
  currency?: string
}

type Tab = 'overview' | 'items' | 'slow-movers'

export default function StockAgeClient({ storeId, currency = 'IDR' }: StockAgeClientProps) {
  const [tab, setTab] = useState<Tab>('overview')
  const [sortField, setSortField] = useState<'ageDays' | 'agingValue' | 'qty'>('ageDays')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [bucketFilter, setBucketFilter] = useState<AgeBucket | 'ALL'>('ALL')

  // Summary
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<StockAgeSummary>({
    queryKey: ['stock-age-summary', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/stock-age/summary?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch summary')
      return (await res.json()) as StockAgeSummary
    },
  })

  // Items list
  const { data: items = [], isLoading: itemsLoading, refetch: refetchItems } = useQuery<StockAgeItem[]>({
    queryKey: ['stock-age-items', storeId, bucketFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId })
      if (bucketFilter !== 'ALL') params.set('bucket', bucketFilter)
      const res = await fetch(`/api/stock-age?${params}`)
      if (!res.ok) throw new Error('Failed to fetch items')
      return (await res.json()) as StockAgeItem[]
    },
    enabled: tab === 'items',
  })

  // Slow movers
  const { data: slowMovers = [], isLoading: slowMoversLoading, refetch: refetchSlowMovers } = useQuery<SlowMover[]>({
    queryKey: ['stock-age-slow-movers', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/stock-age/slow-movers?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch slow movers')
      return (await res.json()) as SlowMover[]
    },
    enabled: tab === 'slow-movers',
  })

  const handleRefresh = useCallback(() => {
    refetchSummary()
    if (tab === 'items') refetchItems()
    if (tab === 'slow-movers') refetchSlowMovers()
    toast.success('Refreshed')
  }, [tab, refetchSummary, refetchItems, refetchSlowMovers])

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sortedItems = [...items].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1
    return (a[sortField] - b[sortField]) * mul
  })

  const isLoading = summaryLoading || (tab === 'items' && itemsLoading) || (tab === 'slow-movers' && slowMoversLoading)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
            Stock Age Analysis
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            Track how long inventory has been in stock and identify slow-moving items
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--bg-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(['0-30', '31-60', '61-90', '90+'] as AgeBucket[]).map(b => (
              <SummaryCard
                key={b}
                bucket={b}
                currency={currency}
                data={
                  b === '0-30' ? summary.bucket0_30 :
                  b === '31-60' ? summary.bucket31_60 :
                  b === '61-90' ? summary.bucket61_90 :
                  summary.bucket90plus
                }
              />
            ))}
          </div>

          {/* Total aging value banner */}
          <div
            className="rounded-xl p-4 flex items-center justify-between"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Package className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Total Aging Inventory Value</p>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
                  {formatCurrency(summary.totalValue, currency)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>{summary.totalItems} items tracked</p>
            </div>
          </div>
        </>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--bg-2)' }}>
        {([
          { id: 'overview', label: 'Overview' },
          { id: 'items', label: 'All Items' },
          { id: 'slow-movers', label: 'Slow Movers' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              tab === t.id
                ? 'text-white'
                : 'hover:opacity-80'
            )}
            style={tab === t.id
              ? { background: 'var(--primary)', color: '#fff' }
              : { color: 'var(--text-2)' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && summary && (
        <div className="rounded-xl p-6 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>Aging Distribution</h2>
          <div className="space-y-3">
            {(['0-30', '31-60', '61-90', '90+'] as AgeBucket[]).map(b => {
              const cfg = BUCKET_CONFIG[b]
              const bucketData =
                b === '0-30' ? summary.bucket0_30 :
                b === '31-60' ? summary.bucket31_60 :
                b === '61-90' ? summary.bucket61_90 :
                summary.bucket90plus
              const pct = summary.totalValue > 0
                ? Math.round((bucketData.value / summary.totalValue) * 100)
                : 0
              return (
                <div key={b}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className={cfg.color}>{cfg.label}</span>
                    <span style={{ color: 'var(--text-2)' }}>
                      {formatCurrency(bucketData.value, currency)} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-2)' }}>
                    <div
                      className={cn('h-full rounded-full transition-all', cfg.color.replace('text-', 'bg-'))}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'items' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {/* Filters */}
          <div className="p-4 flex flex-wrap gap-2" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
            <span className="text-sm font-medium self-center" style={{ color: 'var(--text-2)' }}>Filter:</span>
            {(['ALL', '0-30', '31-60', '61-90', '90+'] as const).map(b => (
              <button
                key={b}
                onClick={() => setBucketFilter(b)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  bucketFilter === b ? 'text-white' : ''
                )}
                style={bucketFilter === b
                  ? { background: 'var(--primary)', color: '#fff' }
                  : { background: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }
                }
              >
                {b === 'ALL' ? 'All Ages' : BUCKET_CONFIG[b].label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-2)', color: 'var(--text-3)' }}>
                  <th className="px-4 py-3 text-left font-medium">Product</th>
                  <th className="px-4 py-3 text-left font-medium">Warehouse</th>
                  <th className="px-4 py-3 text-left font-medium">Received</th>
                  <th
                    className="px-4 py-3 text-right font-medium cursor-pointer select-none"
                    onClick={() => toggleSort('ageDays')}
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Age {sortField === 'ageDays' ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
                    </span>
                  </th>
                  <th
                    className="px-4 py-3 text-right font-medium cursor-pointer select-none"
                    onClick={() => toggleSort('qty')}
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Qty {sortField === 'qty' ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
                    </span>
                  </th>
                  <th
                    className="px-4 py-3 text-right font-medium cursor-pointer select-none"
                    onClick={() => toggleSort('agingValue')}
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Value {sortField === 'agingValue' ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
                    </span>
                  </th>
                  <th className="px-4 py-3 text-center font-medium">Bucket</th>
                </tr>
              </thead>
              <tbody>
                {itemsLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--text-3)' }}>
                      Loading...
                    </td>
                  </tr>
                ) : sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--text-3)' }}>
                      No inventory records found
                    </td>
                  </tr>
                ) : sortedItems.map((item, i) => {
                  const cfg = BUCKET_CONFIG[item.ageBucket]
                  return (
                    <tr
                      key={item.id}
                      style={{
                        background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-1)',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-1)',
                      }}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.productName}</p>
                        {item.sku && <p className="text-xs" style={{ color: 'var(--text-3)' }}>{item.sku}</p>}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>
                        {item.warehouseName ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>
                        {new Date(item.receivedAt).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {item.ageDays}d
                      </td>
                      <td className="px-4 py-3 text-right">{item.qty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(item.agingValue, currency)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cfg.color, cfg.bg)}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'slow-movers' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="p-4 flex items-center gap-2" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              Products with low turnover rate (&lt;0.5 units sold per unit in stock over 30 days)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-2)', color: 'var(--text-3)' }}>
                  <th className="px-4 py-3 text-left font-medium">Product</th>
                  <th className="px-4 py-3 text-right font-medium">Stock</th>
                  <th className="px-4 py-3 text-right font-medium">Sold (30d)</th>
                  <th className="px-4 py-3 text-right font-medium">Turnover</th>
                  <th className="px-4 py-3 text-right font-medium">Avg Age</th>
                  <th className="px-4 py-3 text-right font-medium">Tied-up Value</th>
                  <th className="px-4 py-3 text-center font-medium">Alert</th>
                </tr>
              </thead>
              <tbody>
                {slowMoversLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--text-3)' }}>
                      Loading...
                    </td>
                  </tr>
                ) : slowMovers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--text-3)' }}>
                      <div className="flex flex-col items-center gap-2">
                        <TrendingDown className="w-8 h-8 opacity-30" />
                        <p>No slow-moving products detected</p>
                      </div>
                    </td>
                  </tr>
                ) : slowMovers.map((item, i) => {
                  const cfg = ALERT_CONFIG[item.alertLevel]
                  return (
                    <tr
                      key={item.productId}
                      style={{
                        background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-1)',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-1)',
                      }}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.productName}</p>
                        {item.sku && <p className="text-xs" style={{ color: 'var(--text-3)' }}>{item.sku}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">{item.currentStock.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{item.unitsSold30d.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {item.turnoverRate.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {Math.round(item.avgAgeDays)}d
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(item.agingValue, currency)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cfg.color, cfg.bg)}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
