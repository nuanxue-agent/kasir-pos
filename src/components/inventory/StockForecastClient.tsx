'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  Package,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ForecastProduct {
  productId: string
  productName: string
  sku: string | null
  currentStock: number
  avgDailySales: number
  daysRemaining: number
  reorderLeadTime: number
  needsReorder: boolean
  forecast30: number
  forecast60: number
  forecast90: number
}

export interface ReorderSuggestion {
  id: string
  storeId: string
  productId: string
  productName?: string
  currentStock: number
  avgDailySales: number
  daysRemaining: number
  suggestedQty: number
  status: 'PENDING' | 'ORDERED' | 'DISMISSED'
  createdAt: string
}

interface StockForecastClientProps {
  storeId: string
}

// ── Pure helpers (also tested in unit tests) ──────────────────────────────────

export function calcAvgDailySales(totalSold: number, periodDays: number): number {
  if (periodDays <= 0) return 0
  return totalSold / periodDays
}

export function calcDaysRemaining(currentStock: number, avgDailySales: number): number {
  if (avgDailySales <= 0) return Infinity
  return currentStock / avgDailySales
}

export function calcForecastStock(
  currentStock: number,
  avgDailySales: number,
  daysAhead: number,
): number {
  return Math.max(0, currentStock - avgDailySales * daysAhead)
}

export function calcSuggestedQty(
  avgDailySales: number,
  leadTimeDays: number,
  safetyStockDays = 7,
): number {
  // Reorder point formula: cover lead time + safety buffer
  return Math.ceil(avgDailySales * (leadTimeDays + safetyStockDays))
}

export function needsReorder(daysRemaining: number, leadTimeDays: number): boolean {
  return isFinite(daysRemaining) && daysRemaining < leadTimeDays
}

// ── Status badge ──────────────────────────────────────────────────────────────

const SUGGESTION_STATUS_CONFIG: Record<
  ReorderSuggestion['status'],
  { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
> = {
  PENDING: {
    label: 'Pending',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  ORDERED: {
    label: 'Ordered',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: <CheckCircle className="h-3.5 w-3.5" />,
  },
  DISMISSED: {
    label: 'Dismissed',
    bg: 'bg-[var(--bg-card)]',
    text: 'text-[var(--text-2)]',
    border: 'border-[var(--border)]',
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
}

function SuggestionStatusBadge({ status }: { status: ReorderSuggestion['status'] }) {
  const cfg = SUGGESTION_STATUS_CONFIG[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border',
        cfg.bg,
        cfg.text,
        cfg.border,
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ── Forecast row ──────────────────────────────────────────────────────────────

function ForecastRow({ product }: { product: ForecastProduct }) {
  const urgency =
    product.daysRemaining < product.reorderLeadTime
      ? 'critical'
      : product.daysRemaining < product.reorderLeadTime * 2
        ? 'warning'
        : 'ok'

  const urgencyColors = {
    critical: 'text-red-600',
    warning: 'text-amber-600',
    ok: 'text-green-600',
  }

  return (
    <tr className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors">
      <td className="py-3 px-4">
        <div className="font-medium text-[var(--text-1)] text-sm">{product.productName}</div>
        {product.sku && <div className="text-xs text-[var(--text-2)]">{product.sku}</div>}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-sm text-[var(--text-1)]">
        {product.currentStock.toLocaleString()}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-sm text-[var(--text-2)]">
        {product.avgDailySales.toFixed(1)}
      </td>
      <td className={cn('py-3 px-4 text-right tabular-nums text-sm font-medium', urgencyColors[urgency])}>
        {isFinite(product.daysRemaining) ? `${Math.floor(product.daysRemaining)}d` : '∞'}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-sm text-[var(--text-2)]">
        {Math.round(product.forecast30).toLocaleString()}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-sm text-[var(--text-2)]">
        {Math.round(product.forecast60).toLocaleString()}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-sm text-[var(--text-2)]">
        {Math.round(product.forecast90).toLocaleString()}
      </td>
      <td className="py-3 px-4 text-center">
        {product.needsReorder ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-medium text-red-700">
            <AlertTriangle className="h-3 w-3" />
            Reorder
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-medium text-green-700">
            <CheckCircle className="h-3 w-3" />
            OK
          </span>
        )}
      </td>
    </tr>
  )
}

// ── Reorder suggestion row ────────────────────────────────────────────────────

interface SuggestionRowProps {
  suggestion: ReorderSuggestion
  onStatusChange: (id: string, status: ReorderSuggestion['status']) => Promise<void>
  onCreatePO: (suggestion: ReorderSuggestion) => Promise<void>
  updating: boolean
}

function SuggestionRow({ suggestion, onStatusChange, onCreatePO, updating }: SuggestionRowProps) {
  return (
    <tr className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors">
      <td className="py-3 px-4">
        <div className="font-medium text-[var(--text-1)] text-sm">
          {suggestion.productName ?? suggestion.productId}
        </div>
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-sm text-[var(--text-1)]">
        {suggestion.currentStock.toLocaleString()}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-sm text-[var(--text-2)]">
        {suggestion.avgDailySales.toFixed(1)}/day
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-sm text-red-600 font-medium">
        {isFinite(suggestion.daysRemaining) ? `${Math.floor(suggestion.daysRemaining)}d` : '∞'}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-sm font-semibold text-[var(--text-1)]">
        {suggestion.suggestedQty.toLocaleString()}
      </td>
      <td className="py-3 px-4">
        <SuggestionStatusBadge status={suggestion.status} />
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2 justify-end">
          {suggestion.status === 'PENDING' && (
            <>
              <button
                onClick={() => onCreatePO(suggestion)}
                disabled={updating}
                className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                Create PO
              </button>
              <button
                onClick={() => onStatusChange(suggestion.id, 'DISMISSED')}
                disabled={updating}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
              >
                Dismiss
              </button>
            </>
          )}
          {suggestion.status === 'ORDERED' && (
            <span className="text-xs text-[var(--text-2)]">PO created</span>
          )}
          {suggestion.status === 'DISMISSED' && (
            <button
              onClick={() => onStatusChange(suggestion.id, 'PENDING')}
              disabled={updating}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
            >
              Restore
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StockForecastClient({ storeId }: StockForecastClientProps) {
  const [forecast, setForecast] = useState<ForecastProduct[]>([])
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [activeTab, setActiveTab] = useState<'forecast' | 'reorder'>('forecast')
  const [statusFilter, setStatusFilter] = useState<'ALL' | ReorderSuggestion['status']>('PENDING')
  const [sortField, setSortField] = useState<'daysRemaining' | 'currentStock' | 'avgDailySales'>(
    'daysRemaining',
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [forecastRes, suggestionsRes] = await Promise.all([
        fetch(`/api/inventory/forecast?storeId=${storeId}`),
        fetch(`/api/reorder-suggestions?storeId=${storeId}`),
      ])
      if (forecastRes.ok) {
        const data = await forecastRes.json() as any
        setForecast(data.forecast ?? [])
      }
      if (suggestionsRes.ok) {
        const data = await suggestionsRes.json() as any
        setSuggestions(data.suggestions ?? [])
      }
    } catch {
      toast.error('Gagal memuat data forecast')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleStatusChange = async (id: string, status: ReorderSuggestion['status']) => {
    setUpdating(true)
    try {
      const res = await fetch(`/api/reorder-suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      setSuggestions(prev => prev.map(s => (s.id === id ? { ...s, status } : s)))
      toast.success('Status diperbarui')
    } catch {
      toast.error('Gagal memperbarui status')
    } finally {
      setUpdating(false)
    }
  }

  const handleCreatePO = async (suggestion: ReorderSuggestion) => {
    setUpdating(true)
    try {
      // Create a draft PO from suggestion — supplier to be determined by user
      // We just mark suggestion as ORDERED and navigate to purchase orders
      const res = await fetch(`/api/reorder-suggestions/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ORDERED', createPO: true }),
      })
      if (!res.ok) throw new Error()
      setSuggestions(prev =>
        prev.map(s => (s.id === suggestion.id ? { ...s, status: 'ORDERED' } : s)),
      )
      toast.success('Draft PO dibuat — buka Purchase Orders untuk melengkapi')
    } catch {
      toast.error('Gagal membuat PO')
    } finally {
      setUpdating(false)
    }
  }

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sortedForecast = [...forecast].sort((a, b) => {
    const av = isFinite(a[sortField] as number) ? (a[sortField] as number) : 1e9
    const bv = isFinite(b[sortField] as number) ? (b[sortField] as number) : 1e9
    return sortDir === 'asc' ? av - bv : bv - av
  })

  const filteredSuggestions =
    statusFilter === 'ALL' ? suggestions : suggestions.filter(s => s.status === statusFilter)

  const needsReorderCount = forecast.filter(p => p.needsReorder).length
  const pendingCount = suggestions.filter(s => s.status === 'PENDING').length

  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField === field ? (
      sortDir === 'asc' ? (
        <ChevronUp className="inline h-3.5 w-3.5" />
      ) : (
        <ChevronDown className="inline h-3.5 w-3.5" />
      )
    ) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-1)]">Stock Forecast</h1>
          <p className="text-sm text-[var(--text-2)] mt-0.5">
            Proyeksi stok 30/60/90 hari berdasarkan kecepatan penjualan
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text-1)] hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 text-[var(--text-2)] text-xs font-medium uppercase tracking-wide">
            <Package className="h-4 w-4" />
            Total Produk
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--text-1)]">{forecast.length}</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-600 text-xs font-medium uppercase tracking-wide">
            <AlertTriangle className="h-4 w-4" />
            Perlu Reorder
          </div>
          <div className="mt-2 text-2xl font-bold text-red-700">{needsReorderCount}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-600 text-xs font-medium uppercase tracking-wide">
            <Clock className="h-4 w-4" />
            Saran Pending
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{pendingCount}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 text-[var(--text-2)] text-xs font-medium uppercase tracking-wide">
            <TrendingUp className="h-4 w-4" />
            Stok Cukup
          </div>
          <div className="mt-2 text-2xl font-bold text-green-600">
            {forecast.length - needsReorderCount}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {(['forecast', 'reorder'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-2)] hover:text-[var(--text-1)]',
            )}
          >
            {tab === 'forecast' ? (
              <>
                <TrendingDown className="inline h-4 w-4 mr-1.5" />
                Proyeksi Stok
              </>
            ) : (
              <>
                <ShoppingCart className="inline h-4 w-4 mr-1.5" />
                Saran Reorder
                {pendingCount > 0 && (
                  <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {pendingCount}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </div>

      {/* Forecast table */}
      {activeTab === 'forecast' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-2)]">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Memuat data…
            </div>
          ) : sortedForecast.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--text-2)]">
              <Package className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Belum ada data penjualan untuk forecast</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-hover)]">
                    <th className="py-3 px-4 text-left text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                      Produk
                    </th>
                    <th
                      className="py-3 px-4 text-right text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide cursor-pointer select-none"
                      onClick={() => toggleSort('currentStock')}
                    >
                      Stok Saat Ini <SortIcon field="currentStock" />
                    </th>
                    <th
                      className="py-3 px-4 text-right text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide cursor-pointer select-none"
                      onClick={() => toggleSort('avgDailySales')}
                    >
                      Avg/Hari <SortIcon field="avgDailySales" />
                    </th>
                    <th
                      className="py-3 px-4 text-right text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide cursor-pointer select-none"
                      onClick={() => toggleSort('daysRemaining')}
                    >
                      Sisa Hari <SortIcon field="daysRemaining" />
                    </th>
                    <th className="py-3 px-4 text-right text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                      30 Hari
                    </th>
                    <th className="py-3 px-4 text-right text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                      60 Hari
                    </th>
                    <th className="py-3 px-4 text-right text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                      90 Hari
                    </th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedForecast.map(p => (
                    <ForecastRow key={p.productId} product={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reorder suggestions table */}
      {activeTab === 'reorder' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-2)]">Filter:</span>
            {(['ALL', 'PENDING', 'ORDERED', 'DISMISSED'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  statusFilter === f
                    ? 'bg-[var(--accent)] text-white'
                    : 'border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-hover)]',
                )}
              >
                {f === 'ALL' ? 'Semua' : f}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[var(--text-2)]">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                Memuat data…
              </div>
            ) : filteredSuggestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[var(--text-2)]">
                <CheckCircle className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm">Tidak ada saran reorder</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg-hover)]">
                      <th className="py-3 px-4 text-left text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                        Produk
                      </th>
                      <th className="py-3 px-4 text-right text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                        Stok
                      </th>
                      <th className="py-3 px-4 text-right text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                        Kecepatan
                      </th>
                      <th className="py-3 px-4 text-right text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                        Sisa
                      </th>
                      <th className="py-3 px-4 text-right text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                        Qty Saran
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                        Status
                      </th>
                      <th className="py-3 px-4 text-right text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuggestions.map(s => (
                      <SuggestionRow
                        key={s.id}
                        suggestion={s}
                        onStatusChange={handleStatusChange}
                        onCreatePO={handleCreatePO}
                        updating={updating}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
