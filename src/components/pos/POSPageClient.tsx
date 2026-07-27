'use client'

import { useState, useCallback } from 'react'
import { Search, Grid3x3, List, Minus, Plus, Trash2, CreditCard, Banknote, Smartphone, ArrowLeftRight, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import ReceiptModal, { type ReceiptData } from './ReceiptModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  price: number
  stock: number
  trackStock: boolean
  sku?: string | null
  category?: { id: string; name: string; color?: string | null; icon?: string | null } | null
  variants: Array<{ id: string; name: string; price?: number | null; stock: number }>
}

interface Category { id: string; name: string; color?: string | null; icon?: string | null }

interface CartItem {
  id: string
  productId: string
  name: string
  price: number
  qty: number
  subtotal: number
}

interface POSPageClientProps {
  storeId: string
  storeName: string
  taxRate: number
  currency: string
  staffId: string
  initialProducts: Product[]
  categories: Category[]
  receiptNote?: string | null
}

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'QRIS'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n)
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function POSPageClient({ storeId, storeName, taxRate, currency, staffId, initialProducts, categories, receiptNote }: POSPageClientProps) {
  const [products] = useState<Product[]>(initialProducts)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCheckout, setShowCheckout] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = !selectedCategory || p.category?.id === selectedCategory
    return matchSearch && matchCat
  })

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0)
  const taxAmt = Math.round(subtotal * taxRate)
  const total = subtotal + taxAmt

  const addToCart = useCallback((product: Product) => {
    if (product.trackStock && product.stock <= 0) return
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id)
      if (existing) {
        return prev.map(i => i.productId === product.id
          ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price }
          : i
        )
      }
      return [...prev, {
        id: `${product.id}-${Date.now()}`,
        productId: product.id,
        name: product.name,
        price: product.price,
        qty: 1,
        subtotal: product.price,
      }]
    })
  }, [])

  const updateQty = useCallback((id: string, qty: number) => {
    setCart(prev => qty <= 0
      ? prev.filter(i => i.id !== id)
      : prev.map(i => i.id === id ? { ...i, qty, subtotal: qty * i.price } : i)
    )
  }, [])

  const removeItem = useCallback((id: string) => {
    setCart(prev => prev.filter(i => i.id !== id))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  const handleOrderSuccess = (order: ReceiptData) => {
    clearCart()
    setShowCheckout(false)
    setReceiptData(order)
  }

  const handleReceiptClose = (orderNumber: string) => {
    setReceiptData(null)
    setSuccessMsg(`Order ${orderNumber} paid!`)
    setTimeout(() => setSuccessMsg(''), 3500)
  }

  return (
    <div className="flex h-screen bg-[#0a0a0f] overflow-hidden">
      {/* ── Left: Product Grid ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[#0d0d14]">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            <button onClick={() => setViewMode('grid')} className={cn('p-2 transition-colors', viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/40 hover:text-white')}>
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={cn('p-2 transition-colors', viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/40 hover:text-white')}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 px-4 py-2.5 border-b border-white/5 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors', !selectedCategory ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10')}
          >All</button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              className={cn('flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors', selectedCategory === cat.id ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10')}
            >
              {cat.icon && <span>{cat.icon}</span>}
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-white/30">
              <Search className="h-10 w-10 mb-3" />
              <p className="text-sm">No products found</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map(p => <ProductCard key={p.id} product={p} currency={currency} onAdd={addToCart} />)}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
              {filtered.map(p => <ProductRow key={p.id} product={p} currency={currency} onAdd={addToCart} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Cart ── */}
      <div className="w-80 xl:w-96 shrink-0 flex flex-col border-l border-white/5 bg-[#0d0d14]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Current Order</h2>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-300 transition-colors">Clear all</button>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20 py-16">
              <CreditCard className="h-12 w-12" />
              <p className="text-sm">Add items to start an order</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {cart.map(item => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{item.name}</p>
                      <p className="text-xs text-white/40 mt-0.5">{fmt(item.price, currency)} each</p>
                    </div>
                    <button onClick={() => removeItem(item.id)} className="text-white/20 hover:text-red-400 transition-colors mt-0.5">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => updateQty(item.id, item.qty - 1)}
                        className="w-6 h-6 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium text-white">{item.qty}</span>
                      <button onClick={() => updateQty(item.id, item.qty + 1)}
                        className="w-6 h-6 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="text-sm font-semibold text-white">{fmt(item.subtotal, currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary + Checkout */}
        {cart.length > 0 && (
          <div className="border-t border-white/5 p-4 space-y-2">
            <div className="flex justify-between text-sm text-white/50">
              <span>Subtotal</span><span>{fmt(subtotal, currency)}</span>
            </div>
            {taxRate > 0 && (
              <div className="flex justify-between text-sm text-white/50">
                <span>Tax ({(taxRate * 100).toFixed(0)}%)</span><span>{fmt(taxAmt, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-white pt-1 border-t border-white/10">
              <span>Total</span><span>{fmt(total, currency)}</span>
            </div>
            <button
              onClick={() => setShowCheckout(true)}
              className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-indigo-500/20"
            >
              Checkout — {fmt(total, currency)}
            </button>
          </div>
        )}
      </div>

      {/* ── Checkout Modal ── */}
      {showCheckout && (
        <CheckoutModal
          storeId={storeId}
          taxRate={taxRate}
          currency={currency}
          staffId={staffId}
          cart={cart}
          subtotal={subtotal}
          taxAmt={taxAmt}
          total={total}
          onClose={() => setShowCheckout(false)}
          onSuccess={handleOrderSuccess}
        />
      )}

      {/* ── Receipt Modal ── */}
      {receiptData && (
        <ReceiptModal
          receipt={receiptData}
          storeName={storeName}
          currency={currency}
          taxRate={taxRate}
          receiptNote={receiptNote}
          onClose={() => handleReceiptClose(receiptData.number)}
        />
      )}

      {/* ── Success toast ── */}
      {successMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl shadow-emerald-500/20 text-sm font-semibold z-50 flex items-center gap-2">
          <span>✓</span> {successMsg}
        </div>
      )}
    </div>
  )
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product, currency, onAdd }: { product: Product; currency: string; onAdd: (p: Product) => void }) {
  const outOfStock = product.trackStock && product.stock <= 0
  const lowStock = product.trackStock && product.stock > 0 && product.stock <= 5

  return (
    <button
      onClick={() => !outOfStock && onAdd(product)}
      disabled={outOfStock}
      className={cn(
        'flex flex-col p-3.5 rounded-xl border text-left transition-all duration-150 active:scale-[0.97]',
        outOfStock
          ? 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed'
          : 'border-white/10 bg-white/5 hover:border-indigo-500/50 hover:bg-indigo-500/10 cursor-pointer'
      )}
    >
      {product.category?.color && (
        <div className="w-1.5 h-1.5 rounded-full mb-2" style={{ background: product.category.color }} />
      )}
      <div className="w-full aspect-square rounded-lg bg-white/5 flex items-center justify-center mb-3 text-2xl">
        {product.category?.icon || '📦'}
      </div>
      <p className="text-sm font-medium text-white leading-tight line-clamp-2">{product.name}</p>
      {product.category && (
        <p className="text-[10px] text-white/30 mt-0.5">{product.category.icon} {product.category.name}</p>
      )}
      <div className="flex items-center justify-between mt-2">
        <span className="text-sm font-bold text-indigo-400">
          {new Intl.NumberFormat('id-ID', { style: 'currency', currency, minimumFractionDigits: 0 }).format(product.price)}
        </span>
        {product.trackStock && (
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded',
            outOfStock ? 'bg-red-500/20 text-red-400' :
            lowStock ? 'bg-amber-500/20 text-amber-400' :
            'bg-white/10 text-white/40'
          )}>
            {outOfStock ? 'Out' : `${product.stock}`}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Product Row ──────────────────────────────────────────────────────────────

function ProductRow({ product, currency, onAdd }: { product: Product; currency: string; onAdd: (p: Product) => void }) {
  const outOfStock = product.trackStock && product.stock <= 0

  return (
    <button
      onClick={() => !outOfStock && onAdd(product)}
      disabled={outOfStock}
      className={cn(
        'w-full flex items-center gap-4 px-4 py-3 text-left transition-colors',
        outOfStock ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5 cursor-pointer'
      )}
    >
      <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-xl shrink-0">
        {product.category?.icon || '📦'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{product.name}</p>
        <p className="text-xs text-white/30">{product.category?.name}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-indigo-400">
          {new Intl.NumberFormat('id-ID', { style: 'currency', currency, minimumFractionDigits: 0 }).format(product.price)}
        </p>
        {product.trackStock && (
          <p className={cn('text-[10px]', product.stock <= 5 ? 'text-amber-400' : 'text-white/30')}>
            {product.stock} left
          </p>
        )}
      </div>
    </button>
  )
}

// ─── Checkout Modal ───────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { id: 'CASH' as PaymentMethod, label: 'Cash', icon: Banknote, color: 'text-emerald-400' },
  { id: 'CARD' as PaymentMethod, label: 'Card', icon: CreditCard, color: 'text-blue-400' },
  { id: 'QRIS' as PaymentMethod, label: 'QRIS', icon: Smartphone, color: 'text-purple-400' },
  { id: 'TRANSFER' as PaymentMethod, label: 'Transfer', icon: ArrowLeftRight, color: 'text-orange-400' },
]

function CheckoutModal({ storeId, taxRate, currency, staffId, cart, subtotal, taxAmt, total, onClose, onSuccess }: {
  storeId: string; taxRate: number; currency: string; staffId: string
  cart: CartItem[]; subtotal: number; taxAmt: number; total: number
  onClose: () => void; onSuccess: (order: ReceiptData) => void
}) {
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [cashGiven, setCashGiven] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const cashAmount = parseFloat(cashGiven) || 0
  const change = method === 'CASH' ? Math.max(0, cashAmount - total) : 0
  const canPay = method !== 'CASH' || cashAmount >= total

  const quickAmounts = [
    Math.ceil(total / 10000) * 10000,
    Math.ceil(total / 50000) * 50000,
    Math.ceil(total / 100000) * 100000,
  ].filter((v, i, a) => a.indexOf(v) === i && v >= total).slice(0, 3)

  const handlePay = async () => {
    if (!canPay) { setError('Cash given is less than total'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId, userId: staffId,
          items: cart.map(i => ({
            productId: i.productId, name: i.name,
            price: i.price, qty: i.qty, discount: 0,
            subtotal: i.subtotal,
          })),
          payments: [{ method, amount: method === 'CASH' ? cashAmount : total, change }],
          subtotal, taxAmt, total, discountAmt: 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Payment failed'); return }
      onSuccess(data as ReceiptData)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0d0d14] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-base font-semibold text-white">Payment</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Order summary */}
          <div className="bg-white/5 rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm text-white/50"><span>Subtotal</span><span>{fmt(subtotal, currency)}</span></div>
            {taxAmt > 0 && <div className="flex justify-between text-sm text-white/50"><span>Tax</span><span>{fmt(taxAmt, currency)}</span></div>}
            <div className="flex justify-between text-base font-bold text-white pt-1.5 border-t border-white/10"><span>Total</span><span>{fmt(total, currency)}</span></div>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-4 gap-2">
            {PAYMENT_METHODS.map(m => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={cn('flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all',
                  method === m.id ? 'border-indigo-500/60 bg-indigo-500/15 text-white' : 'border-white/10 bg-white/5 text-white/40 hover:text-white hover:border-white/20'
                )}
              >
                <m.icon className={cn('h-5 w-5', method === m.id ? m.color : '')} />
                {m.label}
              </button>
            ))}
          </div>

          {/* Cash input */}
          {method === 'CASH' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Cash Given</label>
              <input
                type="number"
                value={cashGiven}
                onChange={e => setCashGiven(e.target.value)}
                placeholder={fmt(total, currency)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500/50"
              />
              <div className="flex gap-2">
                {quickAmounts.map(a => (
                  <button key={a} onClick={() => setCashGiven(String(a))}
                    className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                    {fmt(a, currency)}
                  </button>
                ))}
              </div>
              {cashAmount >= total && (
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-white/50">Change</span>
                  <span className="text-emerald-400">{fmt(change, currency)}</span>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

          <button
            onClick={handlePay}
            disabled={loading || !canPay}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Processing…' : `Pay ${fmt(total, currency)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
