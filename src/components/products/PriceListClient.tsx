'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Tag, Users, X, Loader2, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { applyPriceListDiscount, isPriceListValid } from '@/lib/price-lists'
import type { PriceListType, DiscountType } from '@/lib/price-lists'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PriceList {
  id: string
  storeId: string
  name: string
  description?: string | null
  type: PriceListType
  discountType: DiscountType
  discountValue: number
  active: boolean
  validFrom?: string | null
  validTo?: string | null
}

interface PriceListItem {
  id: string
  priceListId: string
  productId: string
  price: number
  minQty: number
  productName?: string
  sku?: string
  basePrice?: number
}

interface Product {
  id: string
  name: string
  price: number
  sku?: string
}

interface Customer {
  id: string
  name: string
  phone?: string
}

interface PriceListClientProps {
  storeId: string
  currency: string
  initialPriceLists: PriceList[]
  products: Product[]
  customers: Customer[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<PriceListType, string> = {
  RETAIL: 'Retail',
  WHOLESALE: 'Grosir',
  VIP: 'VIP',
  CUSTOM: 'Custom',
}

const TYPE_COLORS: Record<PriceListType, string> = {
  RETAIL: 'bg-blue-50 text-blue-700',
  WHOLESALE: 'bg-purple-50 text-purple-700',
  VIP: 'bg-amber-50 text-amber-700',
  CUSTOM: 'bg-gray-100 text-gray-700',
}

// ── Form Modal ────────────────────────────────────────────────────────────────

function PriceListFormModal({
  pl,
  storeId,
  onClose,
  onSaved,
}: {
  pl: PriceList | null
  storeId: string
  onClose: () => void
  onSaved: (saved: PriceList) => void
}) {
  const isEdit = !!pl
  const [name, setName] = useState(pl?.name ?? '')
  const [description, setDescription] = useState(pl?.description ?? '')
  const [type, setType] = useState<PriceListType>(pl?.type ?? 'RETAIL')
  const [discountType, setDiscountType] = useState<DiscountType>(pl?.discountType ?? 'PERCENTAGE')
  const [discountValue, setDiscountValue] = useState(String(pl?.discountValue ?? '0'))
  const [active, setActive] = useState(pl?.active ?? true)
  const [validFrom, setValidFrom] = useState(pl?.validFrom ? pl.validFrom.slice(0, 10) : '')
  const [validTo, setValidTo] = useState(pl?.validTo ? pl.validTo.slice(0, 10) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    const dv = Number(discountValue)
    if (isNaN(dv) || dv < 0) { setError('Discount value must be >= 0'); return }
    if (discountType === 'PERCENTAGE' && dv > 100) { setError('Percentage cannot exceed 100'); return }
    setError(''); setSaving(true)
    try {
      const body = {
        storeId,
        name: name.trim(),
        description: description.trim() || null,
        type,
        discountType,
        discountValue: dv,
        active,
        validFrom: validFrom || null,
        validTo: validTo || null,
      }
      let res: Response
      if (isEdit) {
        res = await fetch(`/api/price-lists/${pl.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch(`/api/price-lists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      if (!res.ok) { const d = await res.json() as any; throw new Error(d.error ?? 'Failed') }
      const d = await res.json() as any
      const savedId = isEdit ? pl.id : d.id
      onSaved({
        id: savedId,
        storeId,
        name: name.trim(),
        description: description.trim() || null,
        type,
        discountType,
        discountValue: dv,
        active,
        validFrom: validFrom || null,
        validTo: validTo || null,
      })
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Price List' : 'New Price List'}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="e.g. Wholesale Tier 1"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              rows={2}
              placeholder="Optional description"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={type}
              onChange={e => setType(e.target.value as PriceListType)}
            >
              <option value="RETAIL">Retail</option>
              <option value="WHOLESALE">Wholesale (Grosir)</option>
              <option value="VIP">VIP</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={discountType}
                onChange={e => setDiscountType(e.target.value as DiscountType)}
              >
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed (Rp)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {discountType === 'PERCENTAGE' ? 'Discount %' : 'Discount Rp'}
              </label>
              <input
                type="number"
                min="0"
                max={discountType === 'PERCENTAGE' ? 100 : undefined}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={discountValue}
                onChange={e => setDiscountValue(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={validFrom}
                onChange={e => setValidFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid To</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={validTo}
                onChange={e => setValidTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActive(v => !v)}
              className={cn('relative w-11 h-6 rounded-full transition-colors', active ? 'bg-indigo-500' : 'bg-gray-200')}
            >
              <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', active && 'translate-x-5')} />
            </button>
            <span className="text-sm text-gray-600">{active ? 'Active' : 'Inactive'}</span>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Items Panel ───────────────────────────────────────────────────────────────

function ItemsPanel({
  pl,
  products,
  currency,
}: {
  pl: PriceList
  products: Product[]
  currency: string
}) {
  const [items, setItems] = useState<PriceListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addingProductId, setAddingProductId] = useState(products[0]?.id ?? '')
  const [addingPrice, setAddingPrice] = useState('')
  const [addingMinQty, setAddingMinQty] = useState('1')
  const [saving, setSaving] = useState(false)

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/price-lists/${pl.id}/items`)
      const data = await res.json() as any
      setItems(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [pl.id])

  useEffect(() => { loadItems() }, [loadItems])

  const handleAdd = async () => {
    if (!addingProductId || !addingPrice) return
    setSaving(true)
    try {
      const res = await fetch(`/api/price-lists/${pl.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: addingProductId, price: Number(addingPrice), minQty: Number(addingMinQty) || 1 }),
      })
      if (res.ok) {
        setAddingPrice('')
        setAddingMinQty('1')
        await loadItems()
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-4 text-sm text-gray-400 text-center"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Loading items…</div>

  return (
    <div className="mt-4 space-y-3">
      {items.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-100">
              <th className="text-left pb-2 font-medium">Product</th>
              <th className="text-right pb-2 font-medium">Min Qty</th>
              <th className="text-right pb-2 font-medium">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map(item => (
              <tr key={item.id}>
                <td className="py-1.5 text-gray-700">{item.productName ?? item.productId}</td>
                <td className="py-1.5 text-right text-gray-500">{item.minQty}+</td>
                <td className="py-1.5 text-right font-medium text-indigo-600">{formatCurrency(item.price, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add row */}
      <div className="grid grid-cols-[1fr_80px_100px_auto] gap-2 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Product</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={addingProductId}
            onChange={e => setAddingProductId(e.target.value)}
          >
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Min Qty</label>
          <input
            type="number" min="1"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={addingMinQty}
            onChange={e => setAddingMinQty(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Price (Rp)</label>
          <input
            type="number" min="0"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="0"
            value={addingPrice}
            onChange={e => setAddingPrice(e.target.value)}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={saving || !addingPrice}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Add
        </button>
      </div>
    </div>
  )
}

// ── Price List Card ───────────────────────────────────────────────────────────

function PriceListCard({
  pl,
  products,
  currency,
  onEdit,
  onToggleActive,
}: {
  pl: PriceList
  products: Product[]
  currency: string
  onEdit: () => void
  onToggleActive: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const valid = isPriceListValid(pl)

  return (
    <div className={cn('border rounded-2xl bg-white overflow-hidden transition-shadow hover:shadow-md', valid ? 'border-gray-200' : 'border-gray-100 opacity-75')}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', TYPE_COLORS[pl.type])}>
                {TYPE_LABELS[pl.type]}
              </span>
              {!pl.active && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactive</span>
              )}
              {pl.active && !valid && (
                <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">Expired</span>
              )}
            </div>
            <h3 className="font-semibold text-gray-900 mt-1.5 truncate">{pl.name}</h3>
            {pl.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{pl.description}</p>}
            <p className="text-sm text-indigo-600 font-medium mt-1">
              {pl.discountValue > 0
                ? pl.discountType === 'PERCENTAGE'
                  ? `${pl.discountValue}% off`
                  : `${formatCurrency(pl.discountValue, currency)} off`
                : 'Item-level pricing'}
            </p>
            {(pl.validFrom || pl.validTo) && (
              <p className="text-xs text-gray-400 mt-0.5">
                {pl.validFrom ? pl.validFrom.slice(0, 10) : '∞'} → {pl.validTo ? pl.validTo.slice(0, 10) : '∞'}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggleActive}
              className={cn('w-9 h-5 rounded-full transition-colors relative shrink-0', pl.active ? 'bg-indigo-500' : 'bg-gray-200')}
              title={pl.active ? 'Deactivate' : 'Activate'}
            >
              <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', pl.active && 'translate-x-4')} />
            </button>
            <button onClick={onEdit} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setExpanded(v => !v)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-50">
          <ItemsPanel pl={pl} products={products} currency={currency} />
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PriceListClient({
  storeId,
  currency,
  initialPriceLists,
  products,
  customers,
}: PriceListClientProps) {
  const [priceLists, setPriceLists] = useState<PriceList[]>(initialPriceLists)
  const [showModal, setShowModal] = useState(false)
  const [editingPl, setEditingPl] = useState<PriceList | null>(null)
  const [toastMsg, setToastMsg] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [filter, setFilter] = useState<PriceListType | 'ALL'>('ALL')

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ message, type })
    setTimeout(() => setToastMsg(null), 3000)
  }

  const handleSaved = (saved: PriceList) => {
    setPriceLists(prev => {
      const exists = prev.some(p => p.id === saved.id)
      return exists ? prev.map(p => p.id === saved.id ? saved : p) : [saved, ...prev]
    })
    setShowModal(false)
    setEditingPl(null)
    showToast(editingPl ? 'Price list updated' : 'Price list created')
  }

  const handleToggleActive = async (pl: PriceList) => {
    try {
      const res = await fetch(`/api/price-lists/${pl.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !pl.active }),
      })
      if (!res.ok) throw new Error('Failed')
      setPriceLists(prev => prev.map(p => p.id === pl.id ? { ...p, active: !pl.active } : p))
      showToast(`Price list ${!pl.active ? 'activated' : 'deactivated'}`)
    } catch {
      showToast('Failed to update price list', 'error')
    }
  }

  const filtered = filter === 'ALL' ? priceLists : priceLists.filter(p => p.type === filter)

  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toastMsg && (
        <div className={cn(
          'fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all',
          toastMsg.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white',
        )}>
          {toastMsg.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tag className="w-6 h-6 text-indigo-500" />
            Daftar Harga
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola harga retail, grosir, VIP, dan harga khusus pelanggan</p>
        </div>
        <button
          onClick={() => { setEditingPl(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition-colors"
        >
          <Plus className="w-4 h-4" /> Daftar Harga Baru
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['ALL', 'RETAIL', 'WHOLESALE', 'VIP', 'CUSTOM'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg font-medium transition-colors',
              filter === t ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {t === 'ALL' ? 'Semua' : TYPE_LABELS[t as PriceListType]}
            <span className="ml-1.5 text-xs opacity-70">
              {t === 'ALL' ? priceLists.length : priceLists.filter(p => p.type === t).length}
            </span>
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(pl => (
            <PriceListCard
              key={pl.id}
              pl={pl}
              products={products}
              currency={currency}
              onEdit={() => { setEditingPl(pl); setShowModal(true) }}
              onToggleActive={() => handleToggleActive(pl)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Tag className="w-12 h-12 text-gray-200 mb-4" />
          <p className="text-gray-500 font-medium">Belum ada daftar harga</p>
          <p className="text-sm text-gray-400 mt-1">Buat daftar harga untuk retail, grosir, atau pelanggan VIP</p>
          <button
            onClick={() => { setEditingPl(null); setShowModal(true) }}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition-colors"
          >
            <Plus className="w-4 h-4" /> Buat Daftar Harga
          </button>
        </div>
      )}

      {showModal && (
        <PriceListFormModal
          pl={editingPl}
          storeId={storeId}
          onClose={() => { setShowModal(false); setEditingPl(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
