'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { DollarSign, TrendingUp, AlertCircle, Calculator, Target } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { ExportButton } from '@/components/ExportButton'
import type { ExportColumn } from '@/lib/export'
import { PrintButton } from '@/components/ui/PrintButton'

// Dynamic imports for recharts
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), {
  ssr: false,
})
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const Legend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false })

interface MarginAnalysisClientProps {
  storeId: string
  currency: string
}

interface ProductMargin {
  productId: string
  productName: string
  category: string
  revenue: number
  cost: number
  grossMargin: number
  grossMarginPct: number
  unitsSold: number
  avgPrice: number
  avgCost: number
}

interface TrendData {
  month: string
  grossMarginPct: number
  revenue: number
  cost: number
}

interface BreakEvenResult {
  breakEvenUnits: number
  breakEvenRevenue: number
  margin: number
  marginPct: number
}

// ── Pure business logic (exported for unit tests) ─────────────────────────────

export function calcGrossMargin(revenue: number, cost: number): number {
  return revenue - cost
}

export function calcGrossMarginPct(revenue: number, cost: number): number {
  if (revenue === 0) return 0
  return ((revenue - cost) / revenue) * 100
}

export function calcContributionMargin(
  revenue: number,
  variableCost: number,
  fixedCost: number
): number {
  return revenue - variableCost - fixedCost
}

export function calcBreakEvenUnits(
  fixedCosts: number,
  pricePerUnit: number,
  variableCostPerUnit: number
): number {
  const contributionMargin = pricePerUnit - variableCostPerUnit
  if (contributionMargin <= 0) return Infinity
  return fixedCosts / contributionMargin
}

export function calcMarginPct(revenue: number, cost: number): number {
  return calcGrossMarginPct(revenue, cost)
}

export function calcWhatIfDelta(
  baseRevenue: number,
  baseCost: number,
  newPrice: number,
  newCost: number,
  units: number
): { oldMargin: number; newMargin: number; delta: number; deltaPct: number } {
  const oldMargin = calcGrossMargin(baseRevenue, baseCost)
  const newRevenue = newPrice * units
  const newTotalCost = newCost * units
  const newMargin = calcGrossMargin(newRevenue, newTotalCost)
  const delta = newMargin - oldMargin
  const deltaPct = oldMargin === 0 ? 0 : (delta / oldMargin) * 100
  return { oldMargin, newMargin, delta, deltaPct }
}

export default function MarginAnalysisClient({ storeId, currency }: MarginAnalysisClientProps) {
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [whatIfPrice, setWhatIfPrice] = useState<number>(0)
  const [whatIfCost, setWhatIfCost] = useState<number>(0)
  const [fixedCosts, setFixedCosts] = useState<number>(10000000)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Fetch product margins
  const { data: margins, isLoading: marginsLoading } = useQuery<ProductMargin[]>({
    queryKey: ['margin-analysis', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/margin-analysis?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch margin analysis')
      const json = await res.json()
      return json as ProductMargin[]
    },
  })

  // Fetch margin trends
  const { data: trends, isLoading: trendsLoading } = useQuery<TrendData[]>({
    queryKey: ['margin-trends', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/margin-analysis/trends?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch margin trends')
      const json = await res.json()
      return json as TrendData[]
    },
  })

  const filteredMargins =
    margins?.filter(m => selectedCategory === 'all' || m.category === selectedCategory) ?? []

  const categories = Array.from(new Set(margins?.map(m => m.category) ?? []))

  const lowMarginProducts = filteredMargins.filter(m => m.grossMarginPct < 15)

  const selectedProductData = margins?.find(m => m.productId === selectedProduct)

  const whatIfResult = selectedProductData
    ? calcWhatIfDelta(
        selectedProductData.revenue,
        selectedProductData.cost,
        whatIfPrice || selectedProductData.avgPrice,
        whatIfCost || selectedProductData.avgCost,
        selectedProductData.unitsSold
      )
    : null

  const breakEvenResult = selectedProductData
    ? (() => {
        const units = calcBreakEvenUnits(
          fixedCosts,
          whatIfPrice || selectedProductData.avgPrice,
          whatIfCost || selectedProductData.avgCost
        )
        const revenue = units * (whatIfPrice || selectedProductData.avgPrice)
        const margin = calcGrossMargin(
          revenue,
          units * (whatIfCost || selectedProductData.avgCost)
        )
        const marginPct = calcGrossMarginPct(
          revenue,
          units * (whatIfCost || selectedProductData.avgCost)
        )
        return {
          breakEvenUnits: units,
          breakEvenRevenue: revenue,
          margin,
          marginPct,
        } as BreakEvenResult
      })()
    : null

  const avgMarginPct =
    filteredMargins.length > 0
      ? filteredMargins.reduce((sum, m) => sum + m.grossMarginPct, 0) / filteredMargins.length
      : 0

  const totalRevenue = filteredMargins.reduce((sum, m) => sum + m.revenue, 0)
  const totalCost = filteredMargins.reduce((sum, m) => sum + m.cost, 0)
  const totalMargin = calcGrossMargin(totalRevenue, totalCost)

  const exportColumns: ExportColumn[] = [
    { key: 'productName', label: 'Product' },
    { key: 'category', label: 'Category' },
    { key: 'revenue', label: 'Revenue' },
    { key: 'cost', label: 'Cost' },
    { key: 'grossMargin', label: 'Gross Margin' },
    { key: 'grossMarginPct', label: 'Margin %' },
    { key: 'unitsSold', label: 'Units Sold' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Profit Margin Analysis</h1>
        <div className="flex gap-2">
          <PrintButton />
          <ExportButton
            type="csv"
            label="Export CSV"
            data={filteredMargins as any}
            filename={`margin-analysis-${storeId}`}
            columns={exportColumns}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-[var(--muted-foreground)]" />
            <p className="text-sm text-[var(--muted-foreground)]">Total Revenue</p>
          </div>
          <p className="mt-2 text-2xl font-bold">{formatCurrency(totalRevenue, currency)}</p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[var(--muted-foreground)]" />
            <p className="text-sm text-[var(--muted-foreground)]">Total Margin</p>
          </div>
          <p className="mt-2 text-2xl font-bold">{formatCurrency(totalMargin, currency)}</p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-[var(--muted-foreground)]" />
            <p className="text-sm text-[var(--muted-foreground)]">Avg Margin %</p>
          </div>
          <p className="mt-2 text-2xl font-bold">{avgMarginPct.toFixed(1)}%</p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-[var(--destructive)]" />
            <p className="text-sm text-[var(--muted-foreground)]">Low Margin Items</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--destructive)]">
            {lowMarginProducts.length}
          </p>
        </div>
      </div>

      {/* Category Filter */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <label className="mb-2 block text-sm font-medium">Filter by Category</label>
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="w-full rounded border border-[var(--input)] bg-[var(--background)] px-3 py-2"
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Margin Trends Chart */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-4 text-lg font-semibold">12-Month Margin Trends</h2>
        {trendsLoading ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-[var(--muted-foreground)]">Loading trends...</p>
          </div>
        ) : trends && trends.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trends}>
              <XAxis dataKey="month" stroke="var(--muted-foreground)" />
              <YAxis stroke="var(--muted-foreground)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="grossMarginPct"
                name="Gross Margin %"
                stroke="var(--primary)"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center text-[var(--muted-foreground)]">No trend data available</p>
        )}
      </div>

      {/* Product Margins Table */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-4 text-lg font-semibold">Product Margins</h2>
        {marginsLoading ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-[var(--muted-foreground)]">Loading margins...</p>
          </div>
        ) : filteredMargins.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-4 py-2 text-left">Product</th>
                  <th className="px-4 py-2 text-left">Category</th>
                  <th className="px-4 py-2 text-right">Revenue</th>
                  <th className="px-4 py-2 text-right">Cost</th>
                  <th className="px-4 py-2 text-right">Margin</th>
                  <th className="px-4 py-2 text-right">Margin %</th>
                  <th className="px-4 py-2 text-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {filteredMargins.map(m => (
                  <tr
                    key={m.productId}
                    onClick={() => {
                      setSelectedProduct(m.productId)
                      setWhatIfPrice(m.avgPrice)
                      setWhatIfCost(m.avgCost)
                    }}
                    className={`cursor-pointer border-b border-[var(--border)] hover:bg-[var(--accent)] ${
                      m.grossMarginPct < 15 ? 'bg-[var(--destructive)]/10' : ''
                    } ${selectedProduct === m.productId ? 'bg-[var(--accent)]' : ''}`}
                  >
                    <td className="px-4 py-2">{m.productName}</td>
                    <td className="px-4 py-2">{m.category}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(m.revenue, currency)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(m.cost, currency)}</td>
                    <td className="px-4 py-2 text-right">
                      {formatCurrency(m.grossMargin, currency)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {m.grossMarginPct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right">{m.unitsSold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-[var(--muted-foreground)]">No margin data available</p>
        )}
      </div>

      {/* Low Margin Alert */}
      {lowMarginProducts.length > 0 && (
        <div className="rounded-lg border border-[var(--destructive)] bg-[var(--destructive)]/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[var(--destructive)]" />
            <div>
              <h3 className="font-semibold text-[var(--destructive)]">
                Low Margin Products ({lowMarginProducts.length})
              </h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                The following products have margins below 15%:
              </p>
              <ul className="mt-2 space-y-1">
                {lowMarginProducts.slice(0, 5).map(m => (
                  <li key={m.productId} className="text-sm">
                    <span className="font-medium">{m.productName}</span>: {m.grossMarginPct.toFixed(1)}%
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* What-If Scenario & Break-Even Calculator */}
      {selectedProductData && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* What-If Scenario */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="mb-4 flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              <h2 className="text-lg font-semibold">What-If Scenario</h2>
            </div>
            <p className="mb-4 text-sm text-[var(--muted-foreground)]">
              Product: <span className="font-medium">{selectedProductData.productName}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">New Price per Unit</label>
                <input
                  type="number"
                  value={whatIfPrice}
                  onChange={e => setWhatIfPrice(parseFloat(e.target.value) || 0)}
                  className="w-full rounded border border-[var(--input)] bg-[var(--background)] px-3 py-2"
                  placeholder="Enter new price"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">New Cost per Unit</label>
                <input
                  type="number"
                  value={whatIfCost}
                  onChange={e => setWhatIfCost(parseFloat(e.target.value) || 0)}
                  className="w-full rounded border border-[var(--input)] bg-[var(--background)] px-3 py-2"
                  placeholder="Enter new cost"
                />
              </div>

              {whatIfResult && (
                <div className="mt-4 space-y-2 rounded border border-[var(--border)] bg-[var(--accent)] p-4">
                  <div className="flex justify-between">
                    <span className="text-sm">Current Margin:</span>
                    <span className="font-medium">
                      {formatCurrency(whatIfResult.oldMargin, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">New Margin:</span>
                    <span className="font-medium">
                      {formatCurrency(whatIfResult.newMargin, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-[var(--border)] pt-2">
                    <span className="text-sm font-semibold">Impact:</span>
                    <span
                      className={`font-semibold ${
                        whatIfResult.delta >= 0 ? 'text-green-600' : 'text-[var(--destructive)]'
                      }`}
                    >
                      {whatIfResult.delta >= 0 ? '+' : ''}
                      {formatCurrency(whatIfResult.delta, currency)} ({whatIfResult.deltaPct.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Break-Even Calculator */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="mb-4 flex items-center gap-2">
              <Target className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Break-Even Analysis</h2>
            </div>
            <p className="mb-4 text-sm text-[var(--muted-foreground)]">
              Product: <span className="font-medium">{selectedProductData.productName}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Fixed Costs (Monthly)</label>
                <input
                  type="number"
                  value={fixedCosts}
                  onChange={e => setFixedCosts(parseFloat(e.target.value) || 0)}
                  className="w-full rounded border border-[var(--input)] bg-[var(--background)] px-3 py-2"
                  placeholder="Enter fixed costs"
                />
              </div>

              {breakEvenResult && (
                <div className="mt-4 space-y-2 rounded border border-[var(--border)] bg-[var(--accent)] p-4">
                  <div className="flex justify-between">
                    <span className="text-sm">Break-Even Units:</span>
                    <span className="font-medium">
                      {Number.isFinite(breakEvenResult.breakEvenUnits)
                        ? Math.ceil(breakEvenResult.breakEvenUnits).toLocaleString()
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Break-Even Revenue:</span>
                    <span className="font-medium">
                      {Number.isFinite(breakEvenResult.breakEvenRevenue)
                        ? formatCurrency(breakEvenResult.breakEvenRevenue, currency)
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-[var(--border)] pt-2">
                    <span className="text-sm">Price per Unit:</span>
                    <span className="font-medium">
                      {formatCurrency(whatIfPrice || selectedProductData.avgPrice, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Variable Cost per Unit:</span>
                    <span className="font-medium">
                      {formatCurrency(whatIfCost || selectedProductData.avgCost, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Contribution Margin:</span>
                    <span className="font-medium">
                      {formatCurrency(
                        (whatIfPrice || selectedProductData.avgPrice) -
                          (whatIfCost || selectedProductData.avgCost),
                        currency
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
