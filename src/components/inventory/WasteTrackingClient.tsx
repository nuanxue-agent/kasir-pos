'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import {
  Trash2,
  Plus,
  X,
  TrendingDown,
  DollarSign,
  Package,
  Calendar,
  User,
  AlertTriangle,
} from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

type WasteReason = 'EXPIRED' | 'DAMAGED' | 'SPOILED' | 'RETURNED' | 'OTHER'

interface WasteLog {
  id: string
  storeId: string
  productId: string
  productName: string
  qty: number
  reason: WasteReason
  cost: number
  recordedBy: string
  recordedAt: string
  notes: string | null
}

interface WasteSummary {
  totalCost: number
  totalQty: number
  byReason: Record<WasteReason, { qty: number; cost: number }>
  byCategory: Record<string, { qty: number; cost: number }>
  byEmployee: Record<string, { qty: number; cost: number }>
}

interface MonthlyTrend {
  month: string
  cost: number
  qty: number
}

interface Product {
  id: string
  name: string
  category: string | null
  cost: number
}

interface WasteTrackingClientProps {
  storeId: string
  currency: string
  initialLogs: WasteLog[]
  products: Product[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function reasonBadge(reason: WasteReason) {
  const colors: Record<WasteReason, string> = {
    EXPIRED: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    DAMAGED: 'bg-red-500/10 text-red-600 border-red-500/20',
    SPOILED: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    RETURNED: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    OTHER: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  }
  const labels: Record<WasteReason, string> = {
    EXPIRED: 'Kadaluwarsa',
    DAMAGED: 'Rusak',
    SPOILED: 'Busuk',
    RETURNED: 'Retur',
    OTHER: 'Lainnya',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', colors[reason])}>
      {labels[reason]}
    </span>
  )
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1)
  return date.toLocaleDateString('id-ID', { year: 'numeric', month: 'short' })
}

// ── Pure Business Logic (exported for testing) ───────────────────────────────

export function calcWasteSummary(logs: WasteLog[]): WasteSummary {
  const summary: WasteSummary = {
    totalCost: 0,
    totalQty: 0,
    byReason: {
      EXPIRED: { qty: 0, cost: 0 },
      DAMAGED: { qty: 0, cost: 0 },
      SPOILED: { qty: 0, cost: 0 },
      RETURNED: { qty: 0, cost: 0 },
      OTHER: { qty: 0, cost: 0 },
    },
    byCategory: {},
    byEmployee: {},
  }

  for (const log of logs) {
    summary.totalCost += log.cost
    summary.totalQty += log.qty
    
    summary.byReason[log.reason].qty += log.qty
    summary.byReason[log.reason].cost += log.cost

    const cat = log.productName.split(' - ')[1] || 'Uncategorized'
    if (!summary.byCategory[cat]) summary.byCategory[cat] = { qty: 0, cost: 0 }
    summary.byCategory[cat].qty += log.qty
    summary.byCategory[cat].cost += log.cost

    if (!summary.byEmployee[log.recordedBy]) summary.byEmployee[log.recordedBy] = { qty: 0, cost: 0 }
    summary.byEmployee[log.recordedBy].qty += log.qty
    summary.byEmployee[log.recordedBy].cost += log.cost
  }

  return summary
}

export function calcMonthlyTrends(logs: WasteLog[]): MonthlyTrend[] {
  const trendMap: Record<string, { cost: number; qty: number }> = {}
  
  for (const log of logs) {
    const month = log.recordedAt.substring(0, 7) // YYYY-MM
    if (!trendMap[month]) trendMap[month] = { cost: 0, qty: 0 }
    trendMap[month].cost += log.cost
    trendMap[month].qty += log.qty
  }

  const trends = Object.entries(trendMap)
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12) // Last 12 months

  return trends
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WasteTrackingClient({
  storeId,
  currency,
  initialLogs,
  products,
}: WasteTrackingClientProps) {
  const [logs, setLogs] = useState<WasteLog[]>(initialLogs)
  const [showAddForm, setShowAddForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('month')

  // Form state
  const [formData, setFormData] = useState({
    productId: '',
    qty: '',
    reason: 'EXPIRED' as WasteReason,
    notes: '',
  })

  const fetchLogs = useCallback(async () => {
    const res = await fetch(`/api/waste-logs?storeId=${storeId}`)
    if (!res.ok) return
    const data = await res.json() as WasteLog[]
    setLogs(data)
  }, [storeId])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleAdd = async () => {
    if (!formData.productId || !formData.qty) {
      toast.error('Pilih produk dan masukkan jumlah')
      return
    }

    const product = products.find(p => p.id === formData.productId)
    if (!product) return

    setLoading(true)
    const res = await fetch(`/api/waste-logs?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: formData.productId,
        qty: parseFloat(formData.qty),
        reason: formData.reason,
        notes: formData.notes || null,
      }),
    })

    const data = await res.json() as any
    if (data.error) {
      toast.error(data.error)
      setLoading(false)
      return
    }

    toast.success('Waste log dicatat')
    setShowAddForm(false)
    setFormData({ productId: '', qty: '', reason: 'EXPIRED', notes: '' })
    await fetchLogs()
    setLoading(false)
  }

  // Filter logs by selected period
  const now = new Date()
  const filteredLogs = logs.filter(log => {
    const logDate = new Date(log.recordedAt)
    const diffDays = (now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24)
    
    if (selectedPeriod === 'week') return diffDays <= 7
    if (selectedPeriod === 'month') return diffDays <= 30
    if (selectedPeriod === 'quarter') return diffDays <= 90
    return diffDays <= 365
  })

  const summary = calcWasteSummary(filteredLogs)
  const trends = calcMonthlyTrends(logs)

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Pelacakan Waste & Kehilangan</h1>
          <p className="text-sm text-[var(--text-3)]">Catat dan analisis produk terbuang, rusak, atau kadaluwarsa</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Catat Waste
        </button>
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {(['week', 'month', 'quarter', 'year'] as const).map(period => (
          <button
            key={period}
            onClick={() => setSelectedPeriod(period)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              selectedPeriod === period
                ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-2)] hover:bg-[var(--bg-2)]'
            )}
          >
            {period === 'week' && '7 Hari'}
            {period === 'month' && '30 Hari'}
            {period === 'quarter' && '90 Hari'}
            {period === 'year' && '1 Tahun'}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-3)]">Total Kerugian</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-1)]">
                {formatCurrency(summary.totalCost, currency)}
              </p>
            </div>
            <div className="rounded-full bg-red-500/10 p-3">
              <DollarSign className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-3)]">Total Unit</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-1)]">{summary.totalQty}</p>
            </div>
            <div className="rounded-full bg-orange-500/10 p-3">
              <Package className="h-5 w-5 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-3)]">Waste Log</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-1)]">{filteredLogs.length}</p>
            </div>
            <div className="rounded-full bg-purple-500/10 p-3">
              <Trash2 className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-3)]">Avg per Hari</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-1)]">
                {formatCurrency(
                  summary.totalCost / (selectedPeriod === 'week' ? 7 : selectedPeriod === 'month' ? 30 : selectedPeriod === 'quarter' ? 90 : 365),
                  currency
                )}
              </p>
            </div>
            <div className="rounded-full bg-blue-500/10 p-3">
              <TrendingDown className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* By Reason */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-1)]">Breakdown per Alasan</h2>
        <div className="space-y-3">
          {(Object.keys(summary.byReason) as WasteReason[]).map(reason => {
            const data = summary.byReason[reason]
            const pct = summary.totalCost > 0 ? (data.cost / summary.totalCost) * 100 : 0
            return (
              <div key={reason} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {reasonBadge(reason)}
                    <span className="text-[var(--text-2)]">{data.qty} unit</span>
                  </div>
                  <span className="font-medium text-[var(--text-1)]">
                    {formatCurrency(data.cost, currency)} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-2)]">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      reason === 'EXPIRED' && 'bg-orange-500',
                      reason === 'DAMAGED' && 'bg-red-500',
                      reason === 'SPOILED' && 'bg-purple-500',
                      reason === 'RETURNED' && 'bg-blue-500',
                      reason === 'OTHER' && 'bg-gray-500'
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Monthly Trends */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-1)]">Tren Bulanan (12 Bulan Terakhir)</h2>
        <div className="space-y-2">
          {trends.map(trend => {
            const maxCost = Math.max(...trends.map(t => t.cost), 1)
            const widthPct = (trend.cost / maxCost) * 100
            return (
              <div key={trend.month} className="flex items-center gap-4">
                <span className="w-20 text-sm text-[var(--text-3)]">{formatMonth(trend.month)}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-8 flex-1 overflow-hidden rounded bg-[var(--bg-2)]">
                      <div
                        className="h-full bg-red-500/80"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="w-32 text-right text-sm font-medium text-[var(--text-1)]">
                      {formatCurrency(trend.cost, currency)}
                    </span>
                    <span className="w-16 text-right text-sm text-[var(--text-3)]">{trend.qty} unit</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* By Category */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-1)]">Breakdown per Kategori</h2>
        <div className="space-y-2">
          {Object.entries(summary.byCategory)
            .sort(([, a], [, b]) => b.cost - a.cost)
            .slice(0, 10)
            .map(([cat, data]) => (
              <div key={cat} className="flex items-center justify-between border-b border-[var(--border)] py-2 last:border-0">
                <span className="text-sm font-medium text-[var(--text-2)]">{cat}</span>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-[var(--text-3)]">{data.qty} unit</span>
                  <span className="text-sm font-semibold text-[var(--text-1)]">
                    {formatCurrency(data.cost, currency)}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* By Employee */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-1)]">Breakdown per Karyawan</h2>
        <div className="space-y-2">
          {Object.entries(summary.byEmployee)
            .sort(([, a], [, b]) => b.cost - a.cost)
            .map(([emp, data]) => (
              <div key={emp} className="flex items-center justify-between border-b border-[var(--border)] py-2 last:border-0">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-[var(--text-3)]" />
                  <span className="text-sm font-medium text-[var(--text-2)]">{emp}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-[var(--text-3)]">{data.qty} unit</span>
                  <span className="text-sm font-semibold text-[var(--text-1)]">
                    {formatCurrency(data.cost, currency)}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Recent Logs Table */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-1)]">Log Terbaru</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="pb-2 font-medium text-[var(--text-3)]">Tanggal</th>
                <th className="pb-2 font-medium text-[var(--text-3)]">Produk</th>
                <th className="pb-2 font-medium text-[var(--text-3)]">Qty</th>
                <th className="pb-2 font-medium text-[var(--text-3)]">Alasan</th>
                <th className="pb-2 font-medium text-[var(--text-3)]">Kerugian</th>
                <th className="pb-2 font-medium text-[var(--text-3)]">Dicatat oleh</th>
                <th className="pb-2 font-medium text-[var(--text-3)]">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.slice(0, 50).map(log => (
                <tr key={log.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2 text-[var(--text-2)]">
                    {new Date(log.recordedAt).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="py-2 font-medium text-[var(--text-1)]">{log.productName}</td>
                  <td className="py-2 text-[var(--text-2)]">{log.qty}</td>
                  <td className="py-2">{reasonBadge(log.reason)}</td>
                  <td className="py-2 font-semibold text-red-600">{formatCurrency(log.cost, currency)}</td>
                  <td className="py-2 text-[var(--text-2)]">{log.recordedBy}</td>
                  <td className="py-2 text-[var(--text-3)]">{log.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredLogs.length === 0 && (
            <div className="py-12 text-center">
              <AlertTriangle className="mx-auto h-12 w-12 text-[var(--text-3)]" />
              <p className="mt-2 text-sm text-[var(--text-3)]">Belum ada log waste untuk periode ini</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-1)]">Catat Waste Baru</h3>
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded p-1 hover:bg-[var(--bg-2)]"
              >
                <X className="h-5 w-5 text-[var(--text-3)]" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">
                  Produk <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.productId}
                  onChange={e => setFormData(prev => ({ ...prev, productId: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:border-[var(--primary)] focus:outline-none"
                >
                  <option value="">Pilih produk...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatCurrency(p.cost, currency)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">
                  Jumlah <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.qty}
                  onChange={e => setFormData(prev => ({ ...prev, qty: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:border-[var(--primary)] focus:outline-none"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Alasan</label>
                <select
                  value={formData.reason}
                  onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value as WasteReason }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:border-[var(--primary)] focus:outline-none"
                >
                  <option value="EXPIRED">Kadaluwarsa</option>
                  <option value="DAMAGED">Rusak</option>
                  <option value="SPOILED">Busuk</option>
                  <option value="RETURNED">Retur</option>
                  <option value="OTHER">Lainnya</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Catatan</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:border-[var(--primary)] focus:outline-none"
                  placeholder="Detail tambahan..."
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-2)]"
              >
                Batal
              </button>
              <button
                onClick={handleAdd}
                disabled={loading}
                className="flex-1 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
