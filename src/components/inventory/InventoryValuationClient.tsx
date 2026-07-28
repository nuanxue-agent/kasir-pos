'use client'

import { useState, useCallback, useEffect } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import {
  BarChart3,
  Package,
  DollarSign,
  TrendingDown,
  Filter,
  ChevronDown,
  RefreshCw,
} from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ValuationMethodType = 'FIFO' | 'AVCO' | 'LIFO'

export interface InventoryLayer {
  id: string
  storeId: string
  productId: string
  productName: string
  qty: number
  costPrice: number
  remainingQty: number
  receivedAt: string
  method: ValuationMethodType
}

export interface COGSEntry {
  id: string
  storeId: string
  productId: string
  productName: string
  qty: number
  costPrice: number
  totalCost: number
  orderId: string | null
  soldAt: string
}

export interface ValuationRow {
  productId: string
  productName: string
  totalQty: number
  totalValue: number
  avgCost: number
  method: ValuationMethodType
}

export interface COGSReportRow {
  period: string
  totalQty: number
  totalCost: number
  entryCount: number
}

interface InventoryValuationClientProps {
  storeId: string
  currency: string
  initialLayers: InventoryLayer[]
  initialCOGS: COGSEntry[]
  initialValuation: ValuationRow[]
  activeMethod: ValuationMethodType
}

// ── Pure Business Logic (exported for testing) ────────────────────────────────

export function calcFIFOCost(
  layers: Array<{ remainingQty: number; costPrice: number }>,
  qtyToSell: number
): number {
  if (qtyToSell <= 0) return 0
  let remaining = qtyToSell
  let totalCost = 0
  for (const layer of layers) {
    if (remaining <= 0) break
    const used = Math.min(layer.remainingQty, remaining)
    totalCost += used * layer.costPrice
    remaining -= used
  }
  return totalCost
}

export function calcLIFOCost(
  layers: Array<{ remainingQty: number; costPrice: number }>,
  qtyToSell: number
): number {
  if (qtyToSell <= 0) return 0
  const reversed = [...layers].reverse()
  let remaining = qtyToSell
  let totalCost = 0
  for (const layer of reversed) {
    if (remaining <= 0) break
    const used = Math.min(layer.remainingQty, remaining)
    totalCost += used * layer.costPrice
    remaining -= used
  }
  return totalCost
}

export function calcAVCOCost(
  layers: Array<{ remainingQty: number; costPrice: number }>,
  qtyToSell: number
): number {
  if (qtyToSell <= 0) return 0
  const totalQty = layers.reduce((s, l) => s + l.remainingQty, 0)
  if (totalQty <= 0) return 0
  const totalValue = layers.reduce((s, l) => s + l.remainingQty * l.costPrice, 0)
  const avgCost = totalValue / totalQty
  return qtyToSell * avgCost
}

export function calcCOGSTotal(entries: COGSEntry[]): number {
  return entries.reduce((s, e) => s + e.totalCost, 0)
}

export function calcInventoryValueRemaining(
  layers: Array<{ remainingQty: number; costPrice: number }>
): number {
  return layers.reduce((s, l) => s + l.remainingQty * l.costPrice, 0)
}

export function aggregateCOGSByPeriod(entries: COGSEntry[]): COGSReportRow[] {
  const map: Record<string, COGSReportRow> = {}
  for (const e of entries) {
    const period = e.soldAt.slice(0, 7) // YYYY-MM
    if (!map[period]) {
      map[period] = { period, totalQty: 0, totalCost: 0, entryCount: 0 }
    }
    map[period].totalQty += e.qty
    map[period].totalCost += e.totalCost
    map[period].entryCount += 1
  }
  return Object.values(map).sort((a, b) => b.period.localeCompare(a.period))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<ValuationMethodType, string> = {
  FIFO: 'FIFO (First In First Out)',
  AVCO: 'AVCO (Average Cost)',
  LIFO: 'LIFO (Last In First Out)',
}

const METHOD_COLORS: Record<ValuationMethodType, string> = {
  FIFO: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  AVCO: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  LIFO: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
}

function methodBadge(method: ValuationMethodType) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', METHOD_COLORS[method])}>
      {method}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function InventoryValuationClient({
  storeId,
  currency,
  initialLayers,
  initialCOGS,
  initialValuation,
  activeMethod,
}: InventoryValuationClientProps) {
  const [layers, setLayers] = useState<InventoryLayer[]>(initialLayers)
  const [cogsEntries, setCOGSEntries] = useState<COGSEntry[]>(initialCOGS)
  const [valuation, setValuation] = useState<ValuationRow[]>(initialValuation)
  const [activeTab, setActiveTab] = useState<'valuation' | 'layers' | 'cogs'>('valuation')
  const [method, setMethod] = useState<ValuationMethodType>(activeMethod)
  const [filterProduct, setFilterProduct] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchValuation = useCallback(async () => {
    const res = await fetch(`/api/inventory-valuation?storeId=${storeId}&method=${method}`)
    if (!res.ok) return
    const data = await res.json() as ValuationRow[]
    setValuation(data)
  }, [storeId, method])

  const fetchLayers = useCallback(async () => {
    const res = await fetch(`/api/inventory-layers?storeId=${storeId}&method=${method}`)
    if (!res.ok) return
    const data = await res.json() as InventoryLayer[]
    setLayers(data)
  }, [storeId, method])

  const fetchCOGS = useCallback(async () => {
    const res = await fetch(`/api/cogs-entries?storeId=${storeId}`)
    if (!res.ok) return
    const data = await res.json() as COGSEntry[]
    setCOGSEntries(data)
  }, [storeId])

  const handleRefresh = async () => {
    setLoading(true)
    await Promise.all([fetchValuation(), fetchLayers(), fetchCOGS()])
    toast.success('Data diperbarui')
    setLoading(false)
  }

  useEffect(() => {
    fetchValuation()
    fetchLayers()
  }, [fetchValuation, fetchLayers])

  useEffect(() => { fetchCOGS() }, [fetchCOGS])

  const filteredValuation = valuation.filter(v =>
    filterProduct ? v.productName.toLowerCase().includes(filterProduct.toLowerCase()) : true
  )

  const totalStockValue = valuation.reduce((s, v) => s + v.totalValue, 0)
  const totalCOGS = calcCOGSTotal(cogsEntries)
  const totalProducts = valuation.length
  const cogsReport = aggregateCOGSByPeriod(cogsEntries)

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Penilaian Inventaris</h1>
          <p className="text-sm text-[var(--text-3)]">Nilai stok dan COGS berdasarkan metode {method}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
            <select
              value={method}
              onChange={e => setMethod(e.target.value as ValuationMethodType)}
              className="bg-transparent text-sm text-[var(--text-2)] outline-none"
            >
              <option value="FIFO">FIFO</option>
              <option value="AVCO">AVCO</option>
              <option value="LIFO">LIFO</option>
            </select>
            <ChevronDown className="h-4 w-4 text-[var(--text-3)]" />
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-2)] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-3)]">Total Nilai Stok</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-1)]">{formatCurrency(totalStockValue, currency)}</p>
              <p className="mt-0.5 text-xs text-[var(--text-3)]">Metode: {method}</p>
            </div>
            <div className="rounded-full bg-blue-500/10 p-3">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-3)]">Total COGS</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-1)]">{formatCurrency(totalCOGS, currency)}</p>
              <p className="mt-0.5 text-xs text-[var(--text-3)]">Harga Pokok Penjualan</p>
            </div>
            <div className="rounded-full bg-red-500/10 p-3">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-3)]">Produk Aktif</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-1)]">{totalProducts}</p>
              <p className="mt-0.5 text-xs text-[var(--text-3)]">Dengan stok tersedia</p>
            </div>
            <div className="rounded-full bg-green-500/10 p-3">
              <Package className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--border)]">
        {(['valuation', 'layers', 'cogs'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]'
            )}
          >
            {tab === 'valuation' ? 'Nilai Stok' : tab === 'layers' ? 'Layer Stok' : 'COGS'}
          </button>
        ))}
      </div>

      {/* Valuation Tab */}
      {activeTab === 'valuation' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
              <Filter className="h-4 w-4 text-[var(--text-3)]" />
              <input
                type="text"
                value={filterProduct}
                onChange={e => setFilterProduct(e.target.value)}
                placeholder="Cari produk..."
                className="bg-transparent text-sm text-[var(--text-1)] outline-none placeholder:text-[var(--text-3)] w-48"
              />
            </div>
            <span className="text-sm text-[var(--text-3)]">{filteredValuation.length} produk</span>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Produk</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Metode</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Total Qty</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Avg Cost</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Total Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredValuation.map(row => (
                    <tr key={row.productId} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-2)]/50">
                      <td className="px-4 py-3 font-medium text-[var(--text-1)]">{row.productName}</td>
                      <td className="px-4 py-3">{methodBadge(row.method)}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{row.totalQty}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{formatCurrency(row.avgCost, currency)}</td>
                      <td className="px-4 py-3 font-semibold text-[var(--text-1)]">{formatCurrency(row.totalValue, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredValuation.length === 0 && (
                <div className="py-12 text-center">
                  <BarChart3 className="mx-auto h-12 w-12 text-[var(--text-3)]" />
                  <p className="mt-2 text-sm text-[var(--text-3)]">Tidak ada data valuasi ditemukan</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Layers Tab */}
      {activeTab === 'layers' && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="px-4 py-3 font-medium text-[var(--text-3)]">Produk</th>
                  <th className="px-4 py-3 font-medium text-[var(--text-3)]">Metode</th>
                  <th className="px-4 py-3 font-medium text-[var(--text-3)]">Qty Awal</th>
                  <th className="px-4 py-3 font-medium text-[var(--text-3)]">Sisa Qty</th>
                  <th className="px-4 py-3 font-medium text-[var(--text-3)]">Harga Pokok</th>
                  <th className="px-4 py-3 font-medium text-[var(--text-3)]">Nilai Sisa</th>
                  <th className="px-4 py-3 font-medium text-[var(--text-3)]">Diterima</th>
                </tr>
              </thead>
              <tbody>
                {layers.map(layer => (
                  <tr key={layer.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-2)]/50">
                    <td className="px-4 py-3 font-medium text-[var(--text-1)]">{layer.productName}</td>
                    <td className="px-4 py-3">{methodBadge(layer.method)}</td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{layer.qty}</td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{layer.remainingQty}</td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{formatCurrency(layer.costPrice, currency)}</td>
                    <td className="px-4 py-3 font-semibold text-[var(--text-1)]">{formatCurrency(layer.remainingQty * layer.costPrice, currency)}</td>
                    <td className="px-4 py-3 text-[var(--text-3)]">
                      {new Date(layer.receivedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {layers.length === 0 && (
              <div className="py-12 text-center">
                <Package className="mx-auto h-12 w-12 text-[var(--text-3)]" />
                <p className="mt-2 text-sm text-[var(--text-3)]">Belum ada layer stok</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* COGS Tab */}
      {activeTab === 'cogs' && (
        <div className="space-y-6">
          {/* COGS Report by period */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--text-1)]">COGS per Periode</h2>
            {cogsReport.length === 0 ? (
              <p className="text-sm text-[var(--text-3)]">Belum ada entri COGS.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="pb-2 font-medium text-[var(--text-3)]">Periode</th>
                    <th className="pb-2 font-medium text-[var(--text-3)]">Jumlah Transaksi</th>
                    <th className="pb-2 font-medium text-[var(--text-3)]">Total Qty</th>
                    <th className="pb-2 font-medium text-[var(--text-3)]">Total COGS</th>
                  </tr>
                </thead>
                <tbody>
                  {cogsReport.map(row => (
                    <tr key={row.period} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-3 font-medium text-[var(--text-1)]">{row.period}</td>
                      <td className="py-3 text-[var(--text-2)]">{row.entryCount}</td>
                      <td className="py-3 text-[var(--text-2)]">{row.totalQty}</td>
                      <td className="py-3 font-semibold text-[var(--text-1)]">{formatCurrency(row.totalCost, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* COGS entries detail */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Tanggal</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Produk</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Qty</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Harga Pokok</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Total COGS</th>
                    <th className="px-4 py-3 font-medium text-[var(--text-3)]">Order ID</th>
                  </tr>
                </thead>
                <tbody>
                  {cogsEntries.slice(0, 100).map(entry => (
                    <tr key={entry.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-2)]/50">
                      <td className="px-4 py-3 text-[var(--text-2)]">
                        {new Date(entry.soldAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text-1)]">{entry.productName}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{entry.qty}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{formatCurrency(entry.costPrice, currency)}</td>
                      <td className="px-4 py-3 font-semibold text-red-600">{formatCurrency(entry.totalCost, currency)}</td>
                      <td className="px-4 py-3 text-xs text-[var(--text-3)]">{entry.orderId ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cogsEntries.length === 0 && (
                <div className="py-12 text-center">
                  <TrendingDown className="mx-auto h-12 w-12 text-[var(--text-3)]" />
                  <p className="mt-2 text-sm text-[var(--text-3)]">Belum ada entri COGS</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
