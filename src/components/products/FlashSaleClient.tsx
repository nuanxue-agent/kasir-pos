'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Zap, Clock, X, Loader2, Tag } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type DiscountType = 'PERCENTAGE' | 'FIXED'

interface FlashSaleItem {
  id?: string
  productId: string
  discountType: DiscountType
  discountValue: number
  maxQty: number
  soldQty: number
  product?: { id: string; name: string; price: number } | null
}

interface FlashSale {
  id: string
  storeId: string
  name: string
  startAt: string
  endAt: string
  active: boolean
  items: FlashSaleItem[]
}

interface Product {
  id: string
  name: string
  price: number
}

interface FlashSaleClientProps {
  storeId: string
  currency: string
  initialSales: FlashSale[]
  products: Product[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSaleActive(sale: FlashSale): boolean {
  const now = Date.now()
  return sale.active && new Date(sale.startAt).getTime() <= now && new Date(sale.endAt).getTime() > now
}

function calcDiscountedPrice(originalPrice: number, discountType: DiscountType, discountValue: number): number {
  if (discountType === 'PERCENTAGE') {
    return Math.round(originalPrice * (1 - discountValue / 100))
  }
  return Math.max(0, originalPrice - discountValue)
}

function formatDatetimeLocal(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Countdown Timer ───────────────────────────────────────────────────────────

function CountdownTimer({ endAt }: { endAt: string }) {
  const getRemaining = useCallback(() => {
    const diff = new Date(endAt).getTime() - Date.now()
    if (diff <= 0) return null
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    const s = Math.floor((diff % 60000) / 1000)
    return { h, m, s }
  }, [endAt])

  const [remaining, setRemaining] = useState(getRemaining)

  useEffect(() => {
    const t = setInterval(() => setRemaining(getRemaining()), 1000)
    return () => clearInterval(t)
  }, [getRemaining])

  if (!remaining) return <span className="text-xs text-red-500 font-medium">Expired</span>

  return (
    <span className="text-xs font-mono text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
      {String(remaining.h).padStart(2, '0')}:{String(remaining.m).padStart(2, '0')}:{String(remaining.s).padStart(2, '0')}
    </span>
  )
}

// ── Sale Form Modal ───────────────────────────────────────────────────────────

function FlashSaleFormModal({
  sale,
  products,
  currency,
  storeId,
  onClose,
  onSaved,
}: {
  sale: FlashSale | null
  products: Product[]
  currency: string
  storeId: string
  onClose: () => void
  onSaved: (s: FlashSale) => void
}) {
  const isEdit = !!sale
  const [name, setName] = useState(sale?.name ?? '')
  const [startAt, setStartAt] = useState(sale ? formatDatetimeLocal(sale.startAt) : '')
  const [endAt, setEndAt] = useState(sale ? formatDatetimeLocal(sale.endAt) : '')
  const [active, setActive] = useState(sale?.active ?? true)
  const [items, setItems] = useState<Array<{ productId: string; discountType: DiscountType; discountValue: string; maxQty: string }>>(
    sale?.items.map(i => ({
      productId: i.productId,
      discountType: i.discountType,
      discountValue: String(i.discountValue),
      maxQty: String(i.maxQty),
    })) ?? []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addItem = () => {
    const unused = products.find(p => !items.some(i => i.productId === p.id))
    const pid = unused?.id ?? products[0]?.id ?? ''
    if (pid) setItems(prev => [...prev, { productId: pid, discountType: 'PERCENTAGE', discountValue: '10', maxQty: '0' }])
  }

  const updateItem = (idx: number, patch: Partial<typeof items[0]>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (!startAt) { setError('Start time is required'); return }
    if (!endAt) { setError('End time is required'); return }
    if (new Date(endAt) <= new Date(startAt)) { setError("End time must be after start time"); return }
    setError('')
    setSaving(true)
    try {
      // Create or update the sale header
      let saleId = sale?.id
      if (isEdit) {
        const res = await fetch(`/api/flash-sales/${saleId}?storeId=${storeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), active }),
        })
        if (!res.ok) { const d = await res.json() as any; throw new Error(d.error ?? 'Failed to update') }
      } else {
        const res = await fetch(`/api/flash-sales?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), active }),
        })
        if (!res.ok) { const d = await res.json() as any; throw new Error(d.error ?? 'Failed to create') }
        const created = await res.json() as any
        saleId = created.id
      }
      // Add new items (for new sale only — edit doesn't support item mutation in this modal)
      if (!isEdit && items.length > 0) {
        for (const item of items) {
          await fetch(`/api/flash-sales/${saleId}/items?storeId=${storeId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: item.productId,
              discountType: item.discountType,
              discountValue: Number(item.discountValue),
              maxQty: Number(item.maxQty),
            }),
          })
        }
      }
      // Fetch the refreshed sale
      const allRes = await fetch(`/api/flash-sales?storeId=${storeId}`)
      const all = await allRes.json() as FlashSale[]
      const refreshed = all.find(s => s.id === saleId)
      if (refreshed) onSaved(refreshed)
      else onSaved({ id: saleId!, storeId, name, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), active, items: [] })
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Flash Sale' : 'New Flash Sale'}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sale Name *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="e.g. Midnight Flash Sale"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
              <input
                type="datetime-local"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={startAt}
                onChange={e => setStartAt(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
              <input
                type="datetime-local"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={endAt}
                onChange={e => setEndAt(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActive(v => !v)}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                active ? 'bg-orange-500' : 'bg-gray-200',
              )}
            >
              <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', active && 'translate-x-5')} />
            </button>
            <span className="text-sm text-gray-600">{active ? 'Active' : 'Inactive'}</span>
          </div>

          {/* Items — only shown for new sales */}
          {!isEdit && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Discounted Products</label>
                <button
                  onClick={addItem}
                  disabled={products.length === 0}
                  className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Product
                </button>
              </div>
              {items.length === 0 && (
                <p className="text-sm text-gray-400 italic">No products yet. Add products to include them in this sale.</p>
              )}
              <div className="space-y-2">
                {items.map((item, idx) => {
                  const prod = products.find(p => p.id === item.productId)
                  const origPrice = prod?.price ?? 0
                  const salePrice = calcDiscountedPrice(origPrice, item.discountType, Number(item.discountValue) || 0)
                  return (
                    <div key={idx} className="border border-gray-100 rounded-xl p-3 bg-gray-50 space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                          value={item.productId}
                          onChange={e => updateItem(idx, { productId: e.target.value })}
                        >
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <button onClick={() => removeItem(idx)} className="p-1 hover:text-red-500 text-gray-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Type</label>
                          <select
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
                            value={item.discountType}
                            onChange={e => updateItem(idx, { discountType: e.target.value as DiscountType })}
                          >
                            <option value="PERCENTAGE">Percentage (%)</option>
                            <option value="FIXED">Fixed (Rp)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            {item.discountType === 'PERCENTAGE' ? 'Discount %' : 'Discount Rp'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={item.discountType === 'PERCENTAGE' ? 100 : undefined}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
                            value={item.discountValue}
                            onChange={e => updateItem(idx, { discountValue: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Max Qty (0=∞)</label>
                          <input
                            type="number"
                            min="0"
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
                            value={item.maxQty}
                            onChange={e => updateItem(idx, { maxQty: e.target.value })}
                          />
                        </div>
                      </div>
                      {origPrice > 0 && (
                        <p className="text-xs text-gray-500">
                          Original: {formatCurrency(origPrice, currency)} → Sale price:{' '}
                          <span className="text-orange-600 font-semibold">{formatCurrency(salePrice, currency)}</span>
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Sale'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FlashSaleClient({
  storeId,
  currency,
  initialSales,
  products,
}: FlashSaleClientProps) {
  const [sales, setSales] = useState<FlashSale[]>(initialSales)
  const [showModal, setShowModal] = useState(false)
  const [editingSale, setEditingSale] = useState<FlashSale | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleSaved = (saved: FlashSale) => {
    setSales(prev => {
      const exists = prev.some(s => s.id === saved.id)
      return exists ? prev.map(s => s.id === saved.id ? saved : s) : [saved, ...prev]
    })
    setShowModal(false)
    setEditingSale(null)
    showToast(editingSale ? 'Flash sale updated' : 'Flash sale created')
  }

  const handleToggleActive = async (sale: FlashSale) => {
    try {
      const res = await fetch(`/api/flash-sales/${sale.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !sale.active }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setSales(prev => prev.map(s => s.id === sale.id ? { ...s, active: !sale.active } : s))
      showToast(`Flash sale ${!sale.active ? 'activated' : 'deactivated'}`)
    } catch {
      showToast('Failed to update flash sale', 'error')
    }
  }

  const activeSales = sales.filter(isSaleActive)
  const inactiveSales = sales.filter(s => !isSaleActive(s))

  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all',
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white',
        )}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-orange-500" />
            Flash Sales
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Time-limited promotions with automatic price discounts at POS</p>
        </div>
        <button
          onClick={() => { setEditingSale(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-xl hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Flash Sale
        </button>
      </div>

      {/* Active Sales */}
      {activeSales.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Active Now ({activeSales.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeSales.map(sale => (
              <SaleCard
                key={sale.id}
                sale={sale}
                products={products}
                currency={currency}
                onEdit={() => { setEditingSale(sale); setShowModal(true) }}
                onToggle={() => handleToggleActive(sale)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming / Past Sales */}
      {inactiveSales.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
            Other Sales ({inactiveSales.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inactiveSales.map(sale => (
              <SaleCard
                key={sale.id}
                sale={sale}
                products={products}
                currency={currency}
                onEdit={() => { setEditingSale(sale); setShowModal(true) }}
                onToggle={() => handleToggleActive(sale)}
              />
            ))}
          </div>
        </section>
      )}

      {sales.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Zap className="w-12 h-12 text-gray-200 mb-4" />
          <p className="text-gray-500 font-medium">No flash sales yet</p>
          <p className="text-sm text-gray-400 mt-1">Create a time-limited discount to boost sales</p>
          <button
            onClick={() => { setEditingSale(null); setShowModal(true) }}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-xl hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" /> Create First Flash Sale
          </button>
        </div>
      )}

      {showModal && (
        <FlashSaleFormModal
          sale={editingSale}
          products={products}
          currency={currency}
          storeId={storeId}
          onClose={() => { setShowModal(false); setEditingSale(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

// ── Sale Card ─────────────────────────────────────────────────────────────────

function SaleCard({
  sale,
  products,
  currency,
  onEdit,
  onToggle,
}: {
  sale: FlashSale
  products: Product[]
  currency: string
  onEdit: () => void
  onToggle: () => void
}) {
  const active = isSaleActive(sale)
  const now = Date.now()
  const started = new Date(sale.startAt).getTime() <= now
  const expired = new Date(sale.endAt).getTime() <= now

  let statusLabel = 'Inactive'
  let statusColor = 'text-gray-400 bg-gray-50'
  if (active) { statusLabel = 'Live'; statusColor = 'text-green-700 bg-green-50' }
  else if (!expired && !started) { statusLabel = 'Upcoming'; statusColor = 'text-blue-700 bg-blue-50' }
  else if (expired) { statusLabel = 'Expired'; statusColor = 'text-red-600 bg-red-50' }

  return (
    <div className={cn(
      'rounded-2xl border p-4 space-y-3 transition-shadow hover:shadow-md',
      active ? 'border-orange-200 bg-orange-50/30' : 'border-gray-100 bg-white',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{sale.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusColor)}>
              {statusLabel}
            </span>
            {active && <CountdownTimer endAt={sale.endAt} />}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggle}
            className={cn(
              'p-1.5 rounded-lg transition-colors text-xs font-medium',
              sale.active ? 'hover:bg-red-50 text-red-400 hover:text-red-600' : 'hover:bg-green-50 text-green-400 hover:text-green-600',
            )}
            title={sale.active ? 'Deactivate' : 'Activate'}
          >
            {sale.active ? '●' : '○'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>{new Date(sale.startAt).toLocaleString()} – {new Date(sale.endAt).toLocaleString()}</span>
      </div>

      {sale.items.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
            <Tag className="w-3 h-3" /> {sale.items.length} product{sale.items.length !== 1 ? 's' : ''}
          </p>
          {sale.items.slice(0, 3).map(item => {
            const prod = item.product ?? products.find(p => p.id === item.productId)
            const origPrice = prod?.price ?? 0
            const salePrice = calcDiscountedPrice(origPrice, item.discountType, item.discountValue)
            return (
              <div key={item.id ?? item.productId} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 truncate max-w-[60%]">{prod?.name ?? item.productId}</span>
                <span className="text-orange-600 font-medium">
                  {item.discountType === 'PERCENTAGE' ? `-${item.discountValue}%` : `-${formatCurrency(item.discountValue, currency)}`}
                  {origPrice > 0 && ` → ${formatCurrency(salePrice, currency)}`}
                </span>
              </div>
            )
          })}
          {sale.items.length > 3 && (
            <p className="text-xs text-gray-400">+{sale.items.length - 3} more</p>
          )}
        </div>
      )}
    </div>
  )
}
