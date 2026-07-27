'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Search,
  Boxes,
  TrendingUp,
  AlertTriangle,
  History,
  Upload,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import StockAdjustModal from './StockAdjustModal'
import StockLogsModal from './StockLogsModal'
import { toast } from '@/components/ui/Toaster'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Product {
  id: string
  name: string
  sku?: string | null
  stock: number
  lowStock: number
  price: number
  category?: { id: string; name: string } | null
}

interface StockHistoryDay {
  date: string
  in: number
  out: number
}

interface InventoryPageClientProps {
  storeId: string
}

type FilterMode = 'all' | 'low' | 'out'

// ── Date helpers ─────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function getLowStockDismissedKey(): string {
  return `low-stock-dismissed-${todayKey()}`
}

// ── Low Stock Alert Banner ───────────────────────────────────────────────────

interface LowStockBannerProps {
  lowStockProducts: Product[]
  onDismiss: () => void
  onAdjust: (product: Product) => void
}

function LowStockBanner({ lowStockProducts, onDismiss, onAdjust }: LowStockBannerProps) {
  if (lowStockProducts.length === 0) return null
  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <h2 className="text-sm font-semibold text-amber-800">
            Low Stock Alerts — {lowStockProducts.length} produk perlu perhatian
          </h2>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss low stock alerts"
          className="shrink-0 p-1 text-amber-500 transition-colors hover:text-amber-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="flex flex-wrap gap-2">
        {lowStockProducts.map(p => (
          <li
            key={p.id}
            className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs"
          >
            <span className="font-medium text-amber-900">{p.name}</span>
            <span className="text-amber-600">({p.stock} sisa)</span>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <button
          onClick={() => onAdjust(lowStockProducts[0])}
          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-600"
        >
          Atur Ulang Stok
        </button>
      </div>
    </div>
  )
}

// ── Per-row Stock History Mini-chart ─────────────────────────────────────────

interface StockHistoryRowProps {
  productId: string
}

function StockHistoryRow({ productId }: StockHistoryRowProps) {
  const [data, setData] = useState<StockHistoryDay[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/inventory/${productId}/history?days=30`)
      .then(r => r.json())
      .then((d: unknown) => {
        if (!cancelled) {
          setData(d as StockHistoryDay[])
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [productId])

  if (loading) {
    return (
      <tr>
        <td colSpan={7} className="px-6 pb-3 text-xs text-[var(--text-3)]">
          Loading history…
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td colSpan={7} className="px-4 pt-0 pb-3">
        <div className="rounded-lg bg-[var(--bg-subtle)] px-3 py-2">
          <p className="mb-1 text-xs font-medium text-[var(--text-3)]">
            Stock history — last 30 days
          </p>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart
              data={data}
              margin={{ top: 2, right: 8, left: -24, bottom: 0 }}
              barCategoryGap="20%"
            >
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                interval={6}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 9, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{ borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 11 }}
                labelFormatter={l => `Date: ${l}`}
              />
              <Legend
                iconType="circle"
                iconSize={7}
                wrapperStyle={{ fontSize: 10, paddingTop: 2 }}
              />
              <Bar dataKey="in" fill="#10b981" name="In" radius={[2, 2, 0, 0]} />
              <Bar dataKey="out" fill="#f59e0b" name="Out" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InventoryPageClient({ storeId }: InventoryPageClientProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState<{ success: number; errors: string[] } | null>(null)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [alertDismissed, setAlertDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(getLowStockDismissedKey()) === '1'
  })
  const csvInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchProducts()
  }, [search, filter, page])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        storeId,
        page: page.toString(),
        limit: '50',
      })

      if (search) params.set('q', search)
      if (filter === 'low') params.set('lowStockOnly', 'true')

      const res = await fetch(`/api/inventory?${params}`)
      const data = (await res.json()) as { products?: Product[]; total?: number }

      let filtered: Product[] = data.products || []

      if (filter === 'out') {
        filtered = filtered.filter((p: Product) => p.stock === 0)
      }

      setProducts(filtered)
      setTotal(data.total || 0)
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStockStatus = (product: Product) => {
    if (product.stock === 0) return { label: 'OUT', color: 'bg-red-500/20 text-red-400' }
    if (product.stock <= product.lowStock)
      return { label: 'LOW', color: 'bg-orange-500/20 text-orange-400' }
    return { label: 'OK', color: 'bg-green-500/20 text-green-400' }
  }

  const handleAdjustStock = (product: Product) => {
    setSelectedProduct(product)
    setShowAdjustModal(true)
  }

  const handleViewLogs = (product: Product) => {
    setSelectedProduct(product)
    setShowLogsModal(true)
  }

  const handleAdjustSuccess = () => {
    setShowAdjustModal(false)
    toast.success('Stok diperbarui')
    fetchProducts()
  }

  const handleDismissAlert = useCallback(() => {
    localStorage.setItem(getLowStockDismissedKey(), '1')
    setAlertDismissed(true)
  }, [])

  const toggleRow = (productId: string) => {
    setExpandedRow(prev => (prev === productId ? null : productId))
  }

  // ── CSV Import ──────────────────────────────────────────────────────────────
  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvImporting(true)
    setCsvResult(null)

    try {
      const text = await file.text()
      const lines = text
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
      if (lines.length < 2) throw new Error('CSV must have header + at least one row')

      const header = lines[0].split(',').map(h => h.trim().toLowerCase())
      const nameIdx = header.indexOf('name')
      const skuIdx = header.indexOf('sku')
      const stockIdx = header.indexOf('stock')
      const lowIdx = header.indexOf('lowstock')

      if (nameIdx === -1 || stockIdx === -1) {
        throw new Error('CSV must contain "name" and "stock" columns')
      }

      let success = 0
      const errors: string[] = []

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim())
        const name = cols[nameIdx] ?? ''
        const sku = skuIdx !== -1 ? cols[skuIdx] : undefined
        const stock = parseInt(cols[stockIdx] ?? '', 10)
        const lowStock = lowIdx !== -1 ? parseInt(cols[lowIdx] ?? '', 10) : undefined

        if (!name || isNaN(stock)) {
          errors.push(`Row ${i + 1}: invalid name or stock`)
          continue
        }

        try {
          const res = await fetch(`/api/inventory/bulk-update?storeId=${storeId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, sku, stock, lowStock }),
          })
          if (res.ok) success++
          else errors.push(`Row ${i + 1}: server error`)
        } catch {
          errors.push(`Row ${i + 1}: network error`)
        }
      }

      setCsvResult({ success, errors })
      if (success > 0) fetchProducts()
    } catch (err: any) {
      setCsvResult({ success: 0, errors: [err.message ?? 'Unknown error'] })
    } finally {
      setCsvImporting(false)
      if (csvInputRef.current) csvInputRef.current.value = ''
    }
  }

  // ── Derived data ────────────────────────────────────────────────────────────
  const lowStockProducts = products.filter(p => p.stock <= p.lowStock)

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text-1)]">
            <Boxes className="h-7 w-7" />
            Inventory Management
          </h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">Track and manage product stock levels</p>
        </div>
        <div className="flex items-center gap-2">
          {/* CSV Import button */}
          <button
            onClick={() => csvInputRef.current?.click()}
            disabled={csvImporting}
            className="flex items-center gap-2 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-stone-200 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {csvImporting ? 'Importing…' : 'Import CSV'}
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvFile}
          />
        </div>
      </div>

      {/* CSV import result */}
      {csvResult && (
        <div
          className={cn(
            'flex items-start gap-3 rounded-xl border p-4 text-sm',
            csvResult.errors.length === 0
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-700',
          )}
        >
          <div className="flex-1">
            <p className="font-semibold">{csvResult.success} row(s) imported successfully.</p>
            {csvResult.errors.length > 0 && (
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                {csvResult.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {csvResult.errors.length > 5 && <li>…and {csvResult.errors.length - 5} more</li>}
              </ul>
            )}
          </div>
          <button onClick={() => setCsvResult(null)} className="shrink-0 p-0.5 hover:opacity-70">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Low Stock Alerts Banner ──────────────────────────────────────────── */}
      {!alertDismissed && lowStockProducts.length > 0 && (
        <LowStockBanner
          lowStockProducts={lowStockProducts}
          onDismiss={handleDismissAlert}
          onAdjust={handleAdjustStock}
        />
      )}

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-[var(--text-2)]" />
          <input
            type="text"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2 pr-4 pl-10 text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:ring-2 focus:ring-amber-400 focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              setFilter('all')
              setPage(1)
            }}
            className={cn(
              'rounded-lg px-4 py-2 font-medium transition-colors',
              filter === 'all'
                ? 'bg-amber-500 text-white'
                : 'bg-[var(--bg-muted)] text-[var(--text-3)] hover:bg-stone-700',
            )}
          >
            All
          </button>
          <button
            onClick={() => {
              setFilter('low')
              setPage(1)
            }}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors',
              filter === 'low'
                ? 'bg-orange-600 text-white'
                : 'bg-[var(--bg-muted)] text-[var(--text-3)] hover:bg-stone-700',
            )}
          >
            <AlertTriangle className="h-4 w-4" />
            Low Stock
          </button>
          <button
            onClick={() => {
              setFilter('out')
              setPage(1)
            }}
            className={cn(
              'rounded-lg px-4 py-2 font-medium transition-colors',
              filter === 'out'
                ? 'bg-red-600 text-white'
                : 'bg-[var(--bg-muted)] text-[var(--text-3)] hover:bg-stone-700',
            )}
          >
            Out of Stock
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-muted)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                <th className="w-6 px-4 py-3 text-left text-sm font-semibold text-[var(--text-3)]"></th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-3)]">
                  Product
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-3)]">
                  SKU
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-3)]">
                  Category
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-[var(--text-3)]">
                  Current Stock
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-[var(--text-3)]">
                  Low Stock Alert
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-[var(--text-3)]">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-[var(--text-3)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[var(--text-2)]">
                    Loading...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[var(--text-2)]">
                    No products found
                  </td>
                </tr>
              ) : (
                products.map(product => {
                  const status = getStockStatus(product)
                  const isExpanded = expandedRow === product.id
                  return (
                    <>
                      <tr
                        key={product.id}
                        className="cursor-pointer border-b border-[var(--border)] hover:bg-stone-700/50"
                        onClick={() => toggleRow(product.id)}
                      >
                        {/* Expand toggle */}
                        <td className="py-3 pr-0 pl-4 text-[var(--text-3)]">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[var(--text-1)]">{product.name}</div>
                          <div className="text-sm text-[var(--text-3)]">
                            {formatCurrency(product.price)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-300">{product.sku || '-'}</td>
                        <td className="px-4 py-3 text-sm text-stone-300">
                          {product.category?.name || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-lg font-semibold text-[var(--text-1)]">
                            {product.stock}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-[var(--text-3)]">
                          {product.lowStock}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                              status.color,
                            )}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleAdjustStock(product)}
                              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm text-white transition-colors hover:bg-amber-600"
                            >
                              <TrendingUp className="h-4 w-4" />
                              Adjust
                            </button>
                            <button
                              onClick={() => handleViewLogs(product)}
                              className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-muted)] px-3 py-1.5 text-sm text-[var(--text-1)] transition-colors hover:bg-stone-200"
                            >
                              <History className="h-4 w-4" />
                              Logs
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <StockHistoryRow key={`hist-${product.id}`} productId={product.id} />
                      )}
                    </>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && products.length > 0 && (
          <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
            <div className="text-sm text-[var(--text-3)]">
              Showing {products.length} of {total} products
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdjustModal && selectedProduct && (
        <StockAdjustModal
          product={selectedProduct}
          onClose={() => setShowAdjustModal(false)}
          onSuccess={handleAdjustSuccess}
        />
      )}

      {showLogsModal && selectedProduct && (
        <StockLogsModal product={selectedProduct} onClose={() => setShowLogsModal(false)} />
      )}
    </div>
  )
}
