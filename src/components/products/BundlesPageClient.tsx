'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Package, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────

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
  product?: Product | null
}

interface Bundle {
  id: string
  name: string
  description?: string | null
  price: number
  active: boolean
  items: BundleItem[]
}

interface BundlesPageClientProps {
  storeId: string
  currency: string
  initialBundles: Bundle[]
  products: Product[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function componentTotal(bundle: Bundle, products: Product[]): number {
  return bundle.items.reduce((sum, item) => {
    const p = item.product ?? products.find(p => p.id === item.productId)
    return sum + (p?.price ?? 0) * item.qty
  }, 0)
}

// ── Bundle Form Modal ──────────────────────────────────────────────────────

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
  const [price, setPrice] = useState(bundle ? String(bundle.price) : '')
  const [items, setItems] = useState<Array<{ productId: string; qty: number }>>(
    bundle?.items.map(i => ({ productId: i.productId, qty: i.qty })) ?? []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addItem = () => {
    const unused = products.find(p => !items.some(i => i.productId === p.id))
    if (unused) setItems(prev => [...prev, { productId: unused.id, qty: 1 }])
    else if (products.length > 0) setItems(prev => [...prev, { productId: products[0].id, qty: 1 }])
  }

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const updateItem = (idx: number, field: 'productId' | 'qty', value: string) => {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, [field]: field === 'qty' ? Math.max(1, Number(value)) : value } : item
    ))
  }

  const componentSum = items.reduce((sum, item) => {
    const p = products.find(p => p.id === item.productId)
    return sum + (p?.price ?? 0) * item.qty
  }, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    const priceNum = parseFloat(price)
    if (isNaN(priceNum) || priceNum < 0) { setError('Valid price is required'); return }
    if (items.length === 0) { setError('Add at least one product'); return }

    setSaving(true); setError('')
    try {
      const url = isEdit ? `/api/bundles/${bundle!.id}` : '/api/bundles'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, price: priceNum, items, storeId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as any).error ?? 'Save failed')
      }
      const json = await res.json() as any
      onSaved({
        id: isEdit ? bundle!.id : json.id,
        name: name.trim(),
        description: description.trim() || null,
        price: priceNum,
        active: true,
        items: items.map(i => ({
          productId: i.productId,
          qty: i.qty,
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <h2 className="text-base font-semibold text-stone-800">{isEdit ? 'Edit Bundle' : 'New Bundle'}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
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

          {/* Bundle Price */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Bundle Price *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-400">
                {currency === 'IDR' ? 'Rp' : currency}
              </span>
              <input
                type="number"
                min={0}
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0"
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20"
              />
            </div>
            {componentSum > 0 && (
              <p className="text-[11px] text-stone-400 mt-1">
                Component total: {formatCurrency(componentSum, currency)}
                {parseFloat(price) > 0 && componentSum > parseFloat(price) && (
                  <span className="ml-1 text-amber-600 font-medium">
                    · saves {formatCurrency(componentSum - parseFloat(price), currency)}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-stone-600">Products *</label>
              <button
                type="button"
                onClick={addItem}
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
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={item.productId}
                      onChange={e => updateItem(idx, 'productId', e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-800 focus:outline-none focus:border-amber-400"
                    >
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={e => updateItem(idx, 'qty', e.target.value)}
                      className="w-16 px-2 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-800 text-center focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-stone-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Bundle'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bundle Card ────────────────────────────────────────────────────────────

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
  const savings = Math.max(0, compTotal - bundle.price)

  return (
    <div className="rounded-xl border border-stone-200 bg-white overflow-hidden hover:border-amber-300 transition-colors">
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-stone-800 truncate">{bundle.name}</p>
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wide">
                  Bundle
                </span>
              </div>
              {bundle.description && (
                <p className="text-xs text-stone-400 mt-0.5 truncate">{bundle.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-base font-bold text-amber-600">{formatCurrency(bundle.price, currency)}</span>
                {savings > 0 && (
                  <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    Save {formatCurrency(savings, currency)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-stone-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
              title="Edit bundle"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete bundle"
            >
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
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">×{item.qty}</span>
                  <span className="text-xs text-stone-700 truncate">{p?.name ?? item.productId}</span>
                </div>
                <span className="text-xs font-medium text-stone-500 shrink-0">
                  {p ? formatCurrency(p.price * item.qty, currency) : '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg transition-all',
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        )}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Product Bundles</h1>
          <p className="text-sm text-stone-500 mt-0.5">Group products into bundles and offer them at a special price</p>
        </div>
        <button
          onClick={() => { setEditingBundle(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" /> New Bundle
        </button>
      </div>

      {/* Empty state */}
      {bundles.length === 0 ? (
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {bundles.map(bundle => (
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
