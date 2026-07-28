'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Package, X, Loader2, ChevronDown, ChevronUp, Tag, Calendar } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

type DiscountType = 'FIXED' | 'PERCENTAGE'

interface Product {
  id: string
  name: string
  price: number
  stock: number
  trackStock: boolean
}

interface BundleItem {
  id?: string
  productId: string
  qty: number
  unitPrice: number
  product?: Product | null
}

interface Bundle {
  id: string
  storeId: string
  name: string
  description?: string | null
  bundlePrice: number
  discountType: DiscountType
  discountValue: number
  active: boolean
  validFrom?: string | null
  validTo?: string | null
  items: BundleItem[]
}

interface BundlesPageClientProps {
  storeId: string
  currency: string
  initialBundles: Bundle[]
  products: Product[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Sum of component retail prices */
function componentTotal(bundle: Bundle, products: Product[]): number {
  return bundle.items.reduce((sum, item) => {
    const p = item.product ?? products.find(p => p.id === item.productId)
    return sum + (p?.price ?? 0) * item.qty
  }, 0)
}

/** Savings = component total minus bundle price (floor 0) */
function bundleSavings(bundle: Bundle, products: Product[]): number {
  return Math.max(0, componentTotal(bundle, products) - bundle.bundlePrice)
}

/** Savings as a percentage of component total */
function bundleSavingsPct(bundle: Bundle, products: Product[]): number {
  const total = componentTotal(bundle, products)
  if (total === 0) return 0
  return Math.round((bundleSavings(bundle, products) / total) * 100)
}

/** Is the bundle currently valid (within date window if set) */
function isBundleValid(bundle: Bundle): boolean {
  if (!bundle.active) return false
  const now = Date.now()
  if (bundle.validFrom && new Date(bundle.validFrom).getTime() > now) return false
  if (bundle.validTo && new Date(bundle.validTo).getTime() <= now) return false
  return true
}

function formatDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Bundle Form Modal ──────────────────────────────────────────────────────────

function BundleFormModal({
  bundle,
  products,
  currency,
  storeId,
  onClose,
  onSaved,
}: {
  bundle: Bundle | null
  products: Product[]
  currency: string
  storeId: string
  onClose: () => void
  onSaved: (b: Bundle) => void
}) {
  const isEdit = !!bundle
  const [name, setName] = useState(bundle?.name ?? '')
  const [description, setDescription] = useState(bundle?.description ?? '')
  const [bundlePrice, setBundlePrice] = useState(bundle ? String(bundle.bundlePrice) : '')
  const [discountType, setDiscountType] = useState<DiscountType>(bundle?.discountType ?? 'FIXED')
  const [discountValue, setDiscountValue] = useState(bundle ? String(bundle.discountValue) : '0')
  const [active, setActive] = useState(bundle?.active ?? true)
  const [validFrom, setValidFrom] = useState(formatDatetimeLocal(bundle?.validFrom))
  const [validTo, setValidTo] = useState(formatDatetimeLocal(bundle?.validTo))
  const [items, setItems] = useState<Array<{ productId: string; qty: number; unitPrice: string }>>(
    bundle?.items.map(i => ({
      productId: i.productId,
      qty: i.qty,
      unitPrice: String(i.unitPrice),
    })) ?? [],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addItem = () => {
    const unused = products.find(p => !items.some(i => i.productId === p.id))
    const prod = unused ?? products[0]
    if (prod) setItems(prev => [...prev, { productId: prod.id, qty: 1, unitPrice: String(prod.price) }])
  }

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const updateItem = (idx: number, patch: Partial<typeof items[0]>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  const compSum = items.reduce((sum, item) => {
    const p = products.find(p => p.id === item.productId)
    return sum + (p?.price ?? 0) * item.qty
  }, 0)

  const priceNum = parseFloat(bundlePrice) || 0
  const savings = Math.max(0, compSum - priceNum)
  const savingsPct = compSum > 0 ? Math.round((savings / compSum) * 100) : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (isNaN(priceNum) || priceNum < 0) { setError('Valid bundle price is required'); return }
    if (items.length === 0) { setError('Add at least one product'); return }
    if (validFrom && validTo && new Date(validTo) <= new Date(validFrom)) {
      setError('Valid To must be after Valid From'); return
    }

    setSaving(true); setError('')
    try {
      const payload = {
        storeId,
        name: name.trim(),
        description: description.trim() || null,
        bundlePrice: priceNum,
        discountType,
        discountValue: Number(discountValue) || 0,
        active,
        validFrom: validFrom ? new Date(validFrom).toISOString() : null,
        validTo: validTo ? new Date(validTo).toISOString() : null,
        items: items.map(i => ({
          productId: i.productId,
          qty: i.qty,
          unitPrice: Number(i.unitPrice) || 0,
        })),
      }

      const url = isEdit ? `/api/bundles/${bundle!.id}` : '/api/bundles'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as any).error ?? 'Save failed')
      }
      const json = await res.json() as any

      onSaved({
        id: isEdit ? bundle!.id : json.id,
        storeId,
        name: name.trim(),
        description: description.trim() || null,
        bundlePrice: priceNum,
        discountType,
        discountValue: Number(discountValue) || 0,
        active,
        validFrom: validFrom ? new Date(validFrom).toISOString() : null,
        validTo: validTo ? new Date(validTo).toISOString() : null,
        items: items.map(i => ({
          productId: i.productId,
          qty: i.qty,
          unitPrice: Number(i.unitPrice) || 0,
          product: products.find(p => p.id === i.productId) ?? null,
        })),
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-semibold text-stone-800">{isEdit ? 'Edit Bundle' : 'New Bundle'}</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Bundle Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Cafe Set"
              className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20"
            />
          </div>

          {/* Bundle Price + Discount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Bundle Price *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-stone-400">
                  {currency === 'IDR' ? 'Rp' : currency}
                </span>
                <input
                  type="number" min={0} value={bundlePrice}
                  onChange={e => setBundlePrice(e.target.value)}
                  placeholder="0"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-800 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20"
                />
              </div>
              {compSum > 0 && priceNum >= 0 && (
                <p className="text-[11px] text-stone-400 mt-1">
                  Component total: {formatCurrency(compSum, currency)}
                  {savings > 0 && (
                    <span className="ml-1 text-emerald-600 font-medium">
                      · saves {formatCurrency(savings, currency)} ({savingsPct}%)
                    </span>
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Extra Discount</label>
              <div className="flex gap-2">
                <select
                  value={discountType}
                  onChange={e => setDiscountType(e.target.value as DiscountType)}
                  className="w-28 px-2 py-2 rounded-lg border border-stone-200 bg-stone-50 text-xs text-stone-800 focus:outline-none focus:border-amber-400"
                >
                  <option value="FIXED">Fixed (Rp)</option>
                  <option value="PERCENTAGE">% Off</option>
                </select>
                <input
                  type="number" min={0} max={discountType === 'PERCENTAGE' ? 100 : undefined}
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-800 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          </div>

          {/* Validity window */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Valid From</label>
              <input
                type="datetime-local" value={validFrom}
                onChange={e => setValidFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-800 focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Valid To</label>
              <input
                type="datetime-local" value={validTo}
                onChange={e => setValidTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-800 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActive(v => !v)}
              className={cn('relative w-10 h-5 rounded-full transition-colors', active ? 'bg-amber-500' : 'bg-stone-200')}
            >
              <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', active && 'translate-x-5')} />
            </button>
            <span className="text-sm text-stone-600">{active ? 'Active' : 'Inactive'}</span>
          </div>

          {/* Products */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-stone-600">Products *</label>
              <button
                type="button" onClick={addItem}
                className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add Product
              </button>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-4 bg-stone-50 rounded-lg border border-dashed border-stone-200">
                No products yet — click Add Product
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((item, idx) => {
                  const prod = products.find(p => p.id === item.productId)
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_60px_80px_28px] gap-2 items-center">
                      <select
                        value={item.productId}
                        onChange={e => {
                          const p = products.find(pr => pr.id === e.target.value)
                          updateItem(idx, { productId: e.target.value, unitPrice: p ? String(p.price) : item.unitPrice })
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-800 focus:outline-none focus:border-amber-400"
                      >
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <input
                        type="number" min={1} value={item.qty}
                        onChange={e => updateItem(idx, { qty: Math.max(1, Number(e.target.value)) })}
                        className="w-full px-2 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-800 text-center focus:outline-none focus:border-amber-400"
                        title="Qty"
                      />
                      <input
                        type="number" min={0} value={item.unitPrice}
                        onChange={e => updateItem(idx, { unitPrice: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs text-stone-800 focus:outline-none focus:border-amber-400"
                        title="Unit price in bundle"
                      />
                      <button type="button" onClick={() => removeItem(idx)}
                        className="p-1 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
                <p className="text-[11px] text-stone-400">Columns: Product / Qty / Unit Price in Bundle</p>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-stone-100">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-100 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit as any} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-60 transition-colors">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Bundle'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bundle Card ────────────────────────────────────────────────────────────────

function BundleCard({
  bundle,
  currency,
  products,
  onEdit,
  onDelete,
}: {
  bundle: Bundle
  currency: string
  products: Product[]
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const compTotal = componentTotal(bundle, products)
  const savings = bundleSavings(bundle, products)
  const savingsPct = bundleSavingsPct(bundle, products)
  const valid = isBundleValid(bundle)

  return (
    <div className={cn(
      'rounded-xl border bg-[var(--bg-card)] overflow-hidden transition-colors',
      valid ? 'border-stone-200 hover:border-amber-300' : 'border-stone-100 opacity-70',
    )}>
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-stone-800 truncate">{bundle.name}</p>
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wide">
                  Bundle
                </span>
                {!bundle.active && (
                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 uppercase tracking-wide">
                    Inactive
                  </span>
                )}
                {bundle.active && !valid && (
                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 uppercase tracking-wide">
                    Expired
                  </span>
                )}
              </div>
              {bundle.description && (
                <p className="text-xs text-stone-400 mt-0.5 truncate">{bundle.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-base font-bold text-amber-600">{formatCurrency(bundle.bundlePrice, currency)}</span>
                {savings > 0 && (
                  <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    Save {formatCurrency(savings, currency)} ({savingsPct}%)
                  </span>
                )}
              </div>
              {/* Discount badge */}
              {bundle.discountValue > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <Tag className="h-3 w-3 text-violet-400" />
                  <span className="text-[11px] text-violet-600">
                    +{bundle.discountType === 'PERCENTAGE'
                      ? `${bundle.discountValue}% off`
                      : formatCurrency(bundle.discountValue, currency) + ' off'}
                  </span>
                </div>
              )}
              {/* Validity window */}
              {(bundle.validFrom || bundle.validTo) && (
                <div className="flex items-center gap-1 mt-1">
                  <Calendar className="h-3 w-3 text-stone-400" />
                  <span className="text-[11px] text-stone-400">
                    {bundle.validFrom ? new Date(bundle.validFrom).toLocaleDateString() : '—'}
                    {' to '}
                    {bundle.validTo ? new Date(bundle.validTo).toLocaleDateString() : '∞'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit}
              className="p-1.5 rounded-lg text-stone-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
              title="Edit bundle">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete}
              className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete bundle">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Items toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-3 flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-700 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {bundle.items.length} item{bundle.items.length !== 1 ? 's' : ''}
          {compTotal > 0 && <span className="text-stone-400">· total value {formatCurrency(compTotal, currency)}</span>}
        </button>
      </div>

      {/* Expanded items */}
      {expanded && (
        <div className="border-t border-stone-100 bg-stone-50 divide-y divide-stone-100">
          {bundle.items.map((item, idx) => {
            const p = item.product ?? products.find(pr => pr.id === item.productId)
            return (
              <div key={idx} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">x{item.qty}</span>
                  <span className="text-xs text-stone-700 truncate">{p?.name ?? item.productId}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.unitPrice > 0 && (
                    <span className="text-[11px] text-stone-400">{formatCurrency(item.unitPrice, currency)}/unit</span>
                  )}
                  <span className="text-xs font-medium text-stone-500">
                    {p ? formatCurrency((item.unitPrice || p.price) * item.qty, currency) : '—'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function BundlesPageClient({
  storeId,
  currency,
  initialBundles,
  products,
}: BundlesPageClientProps) {
  const [bundles, setBundles] = useState<Bundle[]>(initialBundles)
  const [showModal, setShowModal] = useState(false)
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleSaved = (bundle: Bundle) => {
    setBundles(prev => {
      const exists = prev.find(b => b.id === bundle.id)
      return exists ? prev.map(b => b.id === bundle.id ? bundle : b) : [...prev, bundle]
    })
    setShowModal(false)
    setEditingBundle(null)
    showToast(editingBundle ? 'Bundle updated' : 'Bundle created')
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this bundle? This cannot be undone.')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/bundles/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setBundles(prev => prev.filter(b => b.id !== id))
      showToast('Bundle deleted')
    } catch {
      showToast('Failed to delete bundle', 'error')
    } finally {
      setDeleting(null)
    }
  }

  const activeBundles = bundles.filter(isBundleValid)
  const inactiveBundles = bundles.filter(b => !isBundleValid(b))

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg transition-all',
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white',
        )}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <Package className="h-5 w-5 text-amber-500" />
            Product Bundles
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Group products into bundles and combo deals at a special price
          </p>
        </div>
        <button
          onClick={() => { setEditingBundle(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" /> New Bundle
        </button>
      </div>

      {/* Active bundles */}
      {activeBundles.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full" />
            Active ({activeBundles.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeBundles.map(bundle => (
              <div key={bundle.id} className={cn(deleting === bundle.id && 'opacity-50 pointer-events-none')}>
                <BundleCard
                  bundle={bundle}
                  currency={currency}
                  products={products}
                  onEdit={() => { setEditingBundle(bundle); setShowModal(true) }}
                  onDelete={() => handleDelete(bundle.id)}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Inactive / expired bundles */}
      {inactiveBundles.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
            Inactive / Expired ({inactiveBundles.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {inactiveBundles.map(bundle => (
              <div key={bundle.id} className={cn(deleting === bundle.id && 'opacity-50 pointer-events-none')}>
                <BundleCard
                  bundle={bundle}
                  currency={currency}
                  products={products}
                  onEdit={() => { setEditingBundle(bundle); setShowModal(true) }}
                  onDelete={() => handleDelete(bundle.id)}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {bundles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-stone-400">
          <Package className="h-14 w-14 mb-4 opacity-40" />
          <p className="text-base font-medium text-stone-500 mb-1">No bundles yet</p>
          <p className="text-sm text-stone-400 mb-6 text-center max-w-xs">
            Create your first bundle to offer product combinations at a special price
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors"
          >
            <Plus className="h-4 w-4" /> Create First Bundle
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <BundleFormModal
          bundle={editingBundle}
          products={products}
          currency={currency}
          storeId={storeId}
          onClose={() => { setShowModal(false); setEditingBundle(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
