'use client'

import { useState, useCallback } from 'react'
import { formatCurrency, cn } from '@/lib/utils'
import {
  GitCompare,
  Plus,
  X,
  Download,
  FileText,
  ChevronDown,
  ChevronRight,
  Search,
  Loader2,
  CheckCircle2,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  price: number
  cost?: number
  sku?: string | null
  stock?: number
  categoryId?: string | null
  image?: string | null
}

interface ProductSpec {
  id: string
  productId: string
  specName: string
  specValue: string
  specGroup: string
  displayOrder: number
}

interface ComparisonMatrix {
  products: Product[]
  matrix: Record<string, Record<string, Record<string, string>>>
  specKeyOrder: { group: string; name: string }[]
}

interface ProductComparisonClientProps {
  storeId: string
  currency: string
  initialProducts: Product[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SPEC_GROUPS = ['General', 'Technical', 'Dimensions', 'Materials', 'Other']

export function buildComparisonMatrix(
  products: Product[],
  specs: ProductSpec[],
): ComparisonMatrix {
  const specKeyOrder: { group: string; name: string }[] = []
  const seen = new Set<string>()

  for (const s of specs.sort(
    (a, b) => a.displayOrder - b.displayOrder || a.specName.localeCompare(b.specName),
  )) {
    const key = `${s.specGroup}||${s.specName}`
    if (!seen.has(key)) {
      seen.add(key)
      specKeyOrder.push({ group: s.specGroup, name: s.specName })
    }
  }

  const lookup: Record<string, Record<string, string>> = {}
  for (const s of specs) {
    if (!lookup[s.productId]) lookup[s.productId] = {}
    lookup[s.productId][`${s.specGroup}||${s.specName}`] = s.specValue
  }

  const matrix: Record<string, Record<string, Record<string, string>>> = {}
  for (const { group, name } of specKeyOrder) {
    if (!matrix[group]) matrix[group] = {}
    matrix[group][name] = {}
    for (const p of products) {
      matrix[group][name][p.id] = lookup[p.id]?.[`${group}||${name}`] ?? 'N/A'
    }
  }

  return { products, matrix, specKeyOrder }
}

export function groupSpecsByCategory(
  specs: ProductSpec[],
): Record<string, ProductSpec[]> {
  const groups: Record<string, ProductSpec[]> = {}
  for (const s of specs) {
    if (!groups[s.specGroup]) groups[s.specGroup] = []
    groups[s.specGroup].push(s)
  }
  // Sort within each group by displayOrder
  for (const g of Object.keys(groups)) {
    groups[g].sort((a, b) => a.displayOrder - b.displayOrder || a.specName.localeCompare(b.specName))
  }
  return groups
}

export function exportComparisonToCSV(
  products: Product[],
  matrix: ComparisonMatrix['matrix'],
  specKeyOrder: ComparisonMatrix['specKeyOrder'],
  currency: string,
): string {
  const header = ['Spec Group', 'Spec Name', ...products.map(p => p.name)].join(',')
  const priceRow = [
    'General',
    'Price',
    ...products.map(p => formatCurrency(p.price, currency)),
  ]
    .map(v => `"${v}"`)
    .join(',')

  const rows: string[] = [header, priceRow]

  for (const { group, name } of specKeyOrder) {
    const vals = products.map(p => matrix[group]?.[name]?.[p.id] ?? 'N/A')
    rows.push([`"${group}"`, `"${name}"`, ...vals.map(v => `"${v}"`)].join(','))
  }

  return rows.join('\n')
}

export function validateExportFormat(format: 'csv' | 'pdf'): boolean {
  return format === 'csv' || format === 'pdf'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SpecGroupSection({
  group,
  specs,
  products,
  matrix,
}: {
  group: string
  specs: { group: string; name: string }[]
  products: Product[]
  matrix: ComparisonMatrix['matrix']
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <tbody>
      <tr>
        <td
          colSpan={products.length + 1}
          className="bg-[var(--color-surface-secondary)] px-4 py-2 cursor-pointer select-none"
          onClick={() => setCollapsed(c => !c)}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {group}
          </span>
        </td>
      </tr>
      {!collapsed &&
        specs.map(({ name }) => {
          const vals = products.map(p => matrix[group]?.[name]?.[p.id] ?? 'N/A')
          const allSame = vals.every(v => v === vals[0])
          return (
            <tr key={name} className="border-b border-[var(--color-border)]">
              <td className="px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)] w-48 whitespace-nowrap">
                {name}
              </td>
              {vals.map((v, i) => (
                <td
                  key={i}
                  className={cn(
                    'px-4 py-3 text-sm text-center',
                    v === 'N/A'
                      ? 'text-[var(--color-text-muted)] italic'
                      : 'text-[var(--color-text-primary)]',
                    !allSame && v !== 'N/A' && 'font-medium',
                  )}
                >
                  {v}
                </td>
              ))}
            </tr>
          )
        })}
    </tbody>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ProductComparisonClient({
  storeId,
  currency,
  initialProducts,
}: ProductComparisonClientProps) {
  const [allProducts] = useState<Product[]>(initialProducts)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [comparison, setComparison] = useState<ComparisonMatrix | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Spec management state
  const [specsMap, setSpecsMap] = useState<Record<string, ProductSpec[]>>({})
  const [addingSpec, setAddingSpec] = useState<string | null>(null) // productId
  const [newSpec, setNewSpec] = useState({
    specName: '',
    specValue: '',
    specGroup: 'General',
    displayOrder: 0,
  })

  const showToast = (text: string, ok = true) => {
    setToastMsg({ text, ok })
    setTimeout(() => setToastMsg(null), 3000)
  }

  const filteredProducts = allProducts.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()),
  )

  const toggleProduct = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 4) {
        showToast('Maximum 4 products can be compared', false)
        return prev
      }
      return [...prev, id]
    })
    setComparison(null)
  }

  const handleCompare = useCallback(async () => {
    if (selectedIds.length < 2) {
      showToast('Select at least 2 products to compare', false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/product-specs/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, productIds: selectedIds }),
      })
      const data = (await res.json()) as any
      if (!res.ok) throw new Error(data.error ?? 'Compare failed')
      setComparison(data as ComparisonMatrix)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Compare failed', false)
    } finally {
      setLoading(false)
    }
  }, [selectedIds, storeId])

  const handleAddSpec = async (productId: string) => {
    if (!newSpec.specName.trim()) {
      showToast('Spec name is required', false)
      return
    }
    try {
      const res = await fetch('/api/product-specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, productId, ...newSpec }),
      })
      const data = (await res.json()) as any
      if (!res.ok) throw new Error(data.error ?? 'Failed to add spec')
      // Refresh specs for this product
      const specsRes = await fetch(`/api/product-specs?storeId=${storeId}&productId=${productId}`)
      const specsData = (await specsRes.json()) as any
      setSpecsMap(prev => ({ ...prev, [productId]: specsData as ProductSpec[] }))
      setNewSpec({ specName: '', specValue: '', specGroup: 'General', displayOrder: 0 })
      setAddingSpec(null)
      showToast('Spec added')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to add spec', false)
    }
  }

  const handleExportCSV = () => {
    if (!comparison) return
    const csv = exportComparisonToCSV(
      comparison.products,
      comparison.matrix,
      comparison.specKeyOrder,
      currency,
    )
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `product-comparison-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('CSV exported')
  }

  const handleExportPDF = () => {
    if (!comparison) return
    window.print()
    showToast('Print dialog opened for PDF export')
  }

  // Build unique spec groups from comparison matrix
  const groupedSpecs: Record<string, { group: string; name: string }[]> = {}
  if (comparison) {
    for (const { group, name } of comparison.specKeyOrder) {
      if (!groupedSpecs[group]) groupedSpecs[group] = []
      groupedSpecs[group].push({ group, name })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitCompare className="w-6 h-6 text-[var(--color-primary)]" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
              Product Comparison
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Select 2–4 products to compare specs side by side
            </p>
          </div>
        </div>
        {comparison && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] transition-colors"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] transition-colors"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
          </div>
        )}
      </div>

      {/* Product selector */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Search products…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <span className="text-sm text-[var(--color-text-muted)]">
            {selectedIds.length}/4 selected
          </span>
          <button
            onClick={handleCompare}
            disabled={selectedIds.length < 2 || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GitCompare className="w-4 h-4" />
            )}
            Compare
          </button>
        </div>

        {/* Selected chips */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedIds.map(id => {
              const p = allProducts.find(x => x.id === id)
              if (!p) return null
              return (
                <span
                  key={id}
                  className="flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-sm font-medium"
                >
                  {p.name}
                  <button onClick={() => toggleProduct(id)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        {/* Product grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-64 overflow-y-auto pr-1">
          {filteredProducts.map(p => {
            const selected = selectedIds.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() => toggleProduct(p.id)}
                className={cn(
                  'relative flex flex-col items-start p-3 rounded-lg border text-left transition-all',
                  selected
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50 bg-[var(--color-surface-secondary)]',
                )}
              >
                {selected && (
                  <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-[var(--color-primary)]" />
                )}
                <span className="text-sm font-medium text-[var(--color-text-primary)] line-clamp-2 pr-5">
                  {p.name}
                </span>
                <span className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {formatCurrency(p.price, currency)}
                </span>
                {p.sku && (
                  <span className="text-xs text-[var(--color-text-muted)]">{p.sku}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Comparison table */}
      {comparison && comparison.products.length >= 2 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden print:border-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {/* Product header row */}
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider w-48">
                    Specification
                  </th>
                  {comparison.products.map(p => (
                    <th key={p.id} className="px-4 py-3 text-center min-w-[160px]">
                      <div className="font-semibold text-[var(--color-text-primary)]">
                        {p.name}
                      </div>
                      {p.sku && (
                        <div className="text-xs text-[var(--color-text-muted)] font-normal mt-0.5">
                          SKU: {p.sku}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
                {/* Price row */}
                <tr className="border-b border-[var(--color-border)]">
                  <td className="px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">
                    Price
                  </td>
                  {comparison.products.map(p => (
                    <td key={p.id} className="px-4 py-3 text-center">
                      <span className="text-base font-bold text-[var(--color-primary)]">
                        {formatCurrency(p.price, currency)}
                      </span>
                    </td>
                  ))}
                </tr>
                {/* Stock row */}
                <tr className="border-b border-[var(--color-border)]">
                  <td className="px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)]">
                    Stock
                  </td>
                  {comparison.products.map(p => (
                    <td key={p.id} className="px-4 py-3 text-center text-sm text-[var(--color-text-primary)]">
                      {p.stock ?? 'N/A'}
                    </td>
                  ))}
                </tr>
              </thead>

              {/* Spec groups */}
              {Object.entries(groupedSpecs).map(([group, specs]) => (
                <SpecGroupSection
                  key={group}
                  group={group}
                  specs={specs}
                  products={comparison.products}
                  matrix={comparison.matrix}
                />
              ))}

              {comparison.specKeyOrder.length === 0 && (
                <tbody>
                  <tr>
                    <td
                      colSpan={comparison.products.length + 1}
                      className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)] italic"
                    >
                      No specs defined for these products yet. Add specs below.
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Spec management panel — shown when products are selected */}
      {selectedIds.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Manage Specifications
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {selectedIds.map(pid => {
              const product = allProducts.find(p => p.id === pid)
              if (!product) return null
              const specs = specsMap[pid] ?? []
              const grouped = groupSpecsByCategory(specs)
              return (
                <div
                  key={pid}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-3 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {product.name}
                    </span>
                    <button
                      onClick={() => setAddingSpec(addingSpec === pid ? null : pid)}
                      className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add Spec
                    </button>
                  </div>

                  {Object.entries(grouped).map(([group, groupSpecs]) => (
                    <div key={group}>
                      <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                        {group}
                      </p>
                      <div className="space-y-1">
                        {groupSpecs.map(s => (
                          <div key={s.id} className="flex items-center justify-between text-xs">
                            <span className="text-[var(--color-text-secondary)]">{s.specName}</span>
                            <span className="text-[var(--color-text-primary)] font-medium">{s.specValue}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {specs.length === 0 && (
                    <p className="text-xs text-[var(--color-text-muted)] italic">No specs yet</p>
                  )}

                  {addingSpec === pid && (
                    <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Spec name"
                          value={newSpec.specName}
                          onChange={e => setNewSpec(s => ({ ...s, specName: e.target.value }))}
                          className="col-span-2 px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                        />
                        <input
                          type="text"
                          placeholder="Value"
                          value={newSpec.specValue}
                          onChange={e => setNewSpec(s => ({ ...s, specValue: e.target.value }))}
                          className="px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                        />
                        <select
                          value={newSpec.specGroup}
                          onChange={e => setNewSpec(s => ({ ...s, specGroup: e.target.value }))}
                          className="px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                        >
                          {SPEC_GROUPS.map(g => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddSpec(pid)}
                          className="flex-1 py-1.5 rounded bg-[var(--color-primary)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setAddingSpec(null)}
                          className="px-3 py-1.5 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div
          className={cn(
            'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all',
            toastMsg.ok ? 'bg-green-600' : 'bg-red-600',
          )}
        >
          {toastMsg.text}
        </div>
      )}
    </div>
  )
}
