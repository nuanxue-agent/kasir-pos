'use client'

import { useState, useEffect, useRef } from 'react'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Search,
  Boxes,
  TrendingUp,
  AlertTriangle,
  History,
  Upload,
  X,
} from 'lucide-react'
import StockAdjustModal from './StockAdjustModal'
import StockLogsModal from './StockLogsModal'
import { toast } from '@/components/ui/Toaster'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface Product {
  id: string
  name: string
  sku?: string | null
  stock: number
  lowStock: number
  price: number
  category?: { id: string; name: string } | null
}

interface InventoryPageClientProps {
  storeId: string
}

type FilterMode = 'all' | 'low' | 'out'

// Generate mock 30-day stock history for chart preview
function generateMockHistory(products: Product[]) {
  const today = new Date()
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (29 - i))
    const label = `${d.getMonth() + 1}/${d.getDate()}`
    const entry: Record<string, number | string> = { date: label }
    // Show top-3 products by stock fluctuation
    products.slice(0, 3).forEach(p => {
      entry[p.name.slice(0, 12)] = Math.max(
        0,
        p.stock + Math.round((Math.random() - 0.5) * 10 * (i / 30))
      )
    })
    return entry
  })
}

const CHART_COLORS = ['#f59e0b', '#3b82f6', '#10b981']

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
  const [showChart, setShowChart] = useState(false)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState<{ success: number; errors: string[] } | null>(null)
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
      const data = await res.json() as { products?: Product[]; total?: number }

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
    if (product.stock <= product.lowStock) return { label: 'LOW', color: 'bg-orange-500/20 text-orange-400' }
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

  // ── CSV Import ──────────────────────────────────────────────────────────────
  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvImporting(true)
    setCsvResult(null)

    try {
      const text = await file.text()
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length < 2) throw new Error('CSV must have header + at least one row')

      const header = lines[0].split(',').map(h => h.trim().toLowerCase())
      const nameIdx   = header.indexOf('name')
      const skuIdx    = header.indexOf('sku')
      const stockIdx  = header.indexOf('stock')
      const lowIdx    = header.indexOf('lowstock')

      if (nameIdx === -1 || stockIdx === -1) {
        throw new Error('CSV must contain "name" and "stock" columns')
      }

      let success = 0
      const errors: string[] = []

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim())
        const name      = cols[nameIdx] ?? ''
        const sku       = skuIdx !== -1 ? cols[skuIdx] : undefined
        const stock     = parseInt(cols[stockIdx] ?? '', 10)
        const lowStock  = lowIdx !== -1 ? parseInt(cols[lowIdx] ?? '', 10) : undefined

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
  const lowStockProducts = products.filter(p => p.stock > 0 && p.stock <= p.lowStock)
  const outOfStockProducts = products.filter(p => p.stock === 0)
  const alertProducts = [...outOfStockProducts, ...lowStockProducts]

  const chartData = showChart ? generateMockHistory(products) : []
  const chartKeys = products.slice(0, 3).map(p => p.name.slice(0, 12))

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <Boxes className="w-7 h-7" />
            Inventory Management
          </h1>
          <p className="text-stone-400 text-sm mt-1">Track and manage product stock levels</p>
        </div>
        <div className="flex items-center gap-2">
          {/* CSV Import button */}
          <button
            onClick={() => csvInputRef.current?.click()}
            disabled={csvImporting}
            className="flex items-center gap-2 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-600 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {csvImporting ? 'Importing…' : 'Import CSV'}
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvFile}
          />
          {/* Toggle chart */}
          <button
            onClick={() => setShowChart(v => !v)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors',
              showChart
                ? 'bg-amber-500 text-white'
                : 'bg-stone-100 hover:bg-stone-200 text-stone-600'
            )}
          >
            <TrendingUp className="w-4 h-4" />
            Stock Chart
          </button>
        </div>
      </div>

      {/* CSV import result */}
      {csvResult && (
        <div className={cn(
          'flex items-start gap-3 p-4 rounded-xl border text-sm',
          csvResult.errors.length === 0
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        )}>
          <div className="flex-1">
            <p className="font-semibold">{csvResult.success} row(s) imported successfully.</p>
            {csvResult.errors.length > 0 && (
              <ul className="mt-1 list-disc list-inside text-xs space-y-0.5">
                {csvResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                {csvResult.errors.length > 5 && <li>…and {csvResult.errors.length - 5} more</li>}
              </ul>
            )}
          </div>
          <button onClick={() => setCsvResult(null)} className="shrink-0 p-0.5 hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Low Stock Alerts ─────────────────────────────────────────────────── */}
      {alertProducts.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <h2 className="font-semibold text-orange-700 text-sm">
              Low Stock Alerts ({alertProducts.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {alertProducts.map(p => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-white border border-orange-100 rounded-lg px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-800 truncate">{p.name}</p>
                  {p.sku && <p className="text-xs text-stone-400">{p.sku}</p>}
                </div>
                <div className="ml-3 shrink-0 text-right">
                  <span className={cn(
                    'text-xs font-bold px-2 py-0.5 rounded-full',
                    p.stock === 0
                      ? 'bg-red-100 text-red-600'
                      : 'bg-orange-100 text-orange-600'
                  )}>
                    {p.stock === 0 ? 'OUT' : `${p.stock} left`}
                  </span>
                  <p className="text-xs text-stone-400 mt-0.5">min {p.lowStock}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stock History Chart ──────────────────────────────────────────────── */}
      {showChart && products.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-stone-700 mb-4">Stock History — Last 30 Days (top 3 products)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                interval={4}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {chartKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
          <input
            type="text"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { setFilter('all'); setPage(1) }}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-colors',
              filter === 'all'
                ? 'bg-amber-500 text-white'
                : 'bg-stone-100 text-stone-400 hover:bg-stone-700'
            )}
          >
            All
          </button>
          <button
            onClick={() => { setFilter('low'); setPage(1) }}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2',
              filter === 'low'
                ? 'bg-orange-600 text-white'
                : 'bg-stone-100 text-stone-400 hover:bg-stone-700'
            )}
          >
            <AlertTriangle className="w-4 h-4" />
            Low Stock
          </button>
          <button
            onClick={() => { setFilter('out'); setPage(1) }}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-colors',
              filter === 'out'
                ? 'bg-red-600 text-white'
                : 'bg-stone-100 text-stone-400 hover:bg-stone-700'
            )}
          >
            Out of Stock
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-stone-100 rounded-xl border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="text-left px-4 py-3 text-sm font-semibold text-stone-400">Product</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-stone-400">SKU</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-stone-400">Category</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-stone-400">Current Stock</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-stone-400">Low Stock Alert</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-stone-400">Status</th>
                <th className="text-right px-4 py-3 text-sm font-semibold text-stone-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-stone-500">
                    Loading...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-stone-500">
                    No products found
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const status = getStockStatus(product)
                  return (
                    <tr key={product.id} className="border-b border-stone-200 hover:bg-stone-700/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-stone-700">{product.name}</div>
                        <div className="text-sm text-stone-400">{formatCurrency(product.price)}</div>
                      </td>
                      <td className="px-4 py-3 text-stone-300 text-sm">
                        {product.sku || '-'}
                      </td>
                      <td className="px-4 py-3 text-stone-300 text-sm">
                        {product.category?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-lg font-semibold text-stone-800">
                          {product.stock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-stone-400">
                        {product.lowStock}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'inline-flex px-2 py-1 rounded-full text-xs font-medium',
                          status.color
                        )}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleAdjustStock(product)}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <TrendingUp className="w-4 h-4" />
                            Adjust
                          </button>
                          <button
                            onClick={() => handleViewLogs(product)}
                            className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <History className="w-4 h-4" />
                            Logs
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && products.length > 0 && (
          <div className="px-4 py-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between">
            <div className="text-sm text-stone-400">
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
        <StockLogsModal
          product={selectedProduct}
          onClose={() => setShowLogsModal(false)}
        />
      )}
    </div>
  )
}
