'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Search,
  Grid3x3,
  List,
  Minus,
  Plus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  ArrowLeftRight,
  X,
  Loader2,
  UserPlus,
  Star,
  User,
  ScanBarcode,
  Scan,
  ShoppingCart,
  PauseCircle,
  PlayCircle,
  Percent,
  Tag,
  Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import ReceiptModal, { type ReceiptData } from './ReceiptModal'
import BarcodeScanner from './BarcodeScanner'
import { useCurrentStore } from '@/context/StoreContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  price: number
  stock: number
  trackStock: boolean
  sku?: string | null
  barcode?: string | null
  category?: { id: string; name: string; color?: string | null; icon?: string | null } | null
  variants: Array<{ id: string; name: string; price?: number | null; stock: number }>
}

interface BundleItem {
  productId: string
  qty: number
  product: Product | null
}

interface Bundle {
  id: string
  name: string
  price: number
  items: BundleItem[]
}

interface Category {
  id: string
  name: string
  color?: string | null
  icon?: string | null
}

interface CartItem {
  id: string
  productId: string
  name: string
  price: number
  qty: number
  subtotal: number
  bundleId?: string
}

interface Customer {
  id: string
  name: string
  phone: string | null
  points: number
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
  initialBundles?: Bundle[]
}

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'QRIS'

// ─── Hold Order ───────────────────────────────────────────────────────────────

const HELD_ORDERS_KEY = 'pos_held_orders'
const MAX_HELD_ORDERS = 5

interface HeldOrder {
  id: string
  timestamp: number
  items: CartItem[]
  customerName: string | null
  customerId: string | null
  note: string
  discountType: 'PERCENT' | 'FLAT' | null
  discountValue: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(n)
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function POSPageClient({
  storeId,
  storeName,
  taxRate: taxRateProp,
  currency: currencyProp,
  staffId,
  initialProducts,
  categories,
  receiptNote: receiptNoteProp,
  initialBundles = [],
}: POSPageClientProps) {
  // Read live store settings from context (updated when user switches store)
  const currentStore = useCurrentStore()
  const currency = currentStore?.currency ?? currencyProp
  const taxRate = currentStore?.taxRate ?? taxRateProp
  const receiptNote = currentStore?.receiptNote ?? receiptNoteProp
  const [products] = useState<Product[]>(initialProducts)
  const [bundles] = useState<Bundle[]>(initialBundles)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCheckout, setShowCheckout] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Customer selector state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [redeemPoints, setRedeemPoints] = useState(false)

  // Camera barcode scanner modal state
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)

  // Hold order state
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      return JSON.parse(localStorage.getItem(HELD_ORDERS_KEY) ?? '[]')
    } catch {
      return []
    }
  })
  const [showHeldOrders, setShowHeldOrders] = useState(false)

  // Notes state
  const [orderNote, setOrderNote] = useState('')

  // Manual discount state
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FLAT'>('PERCENT')
  const [discountValue, setDiscountValue] = useState('')

  // Computed manual discount amount
  const manualDiscountAmt = () => {
    const v = parseFloat(discountValue) || 0
    if (discountType === 'PERCENT') return Math.round((subtotal * Math.min(v, 100)) / 100)
    return Math.min(v, subtotal)
  }

  // HID barcode scanner state
  const barcodeBuffer = useRef('')
  const lastKeyTime = useRef(0)
  const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't capture if user is typing in search input
      if (document.activeElement === searchRef.current) return
      const now = Date.now()
      const timeDiff = now - lastKeyTime.current
      lastKeyTime.current = now

      if (e.key === 'Enter') {
        const buf = barcodeBuffer.current
        barcodeBuffer.current = ''
        if (barcodeTimer.current) {
          clearTimeout(barcodeTimer.current)
          barcodeTimer.current = null
        }
        if (buf.length >= 4) {
          const product = products.find(p => p.barcode === buf)
          if (product) {
            if (product.trackStock && product.stock <= 0) {
              setSuccessMsg(`⚠ ${product.name} is out of stock`)
            } else {
              addToCart(product)
              setSuccessMsg(`✓ Added: ${product.name}`)
            }
          } else {
            setSuccessMsg(`✗ Barcode not found: ${buf}`)
          }
          setTimeout(() => setSuccessMsg(''), 2500)
        }
        return
      }

      // Accumulate if keys come fast (scanner types < 50ms apart)
      if (e.key.length === 1) {
        if (timeDiff < 50 || barcodeBuffer.current.length > 0) {
          barcodeBuffer.current += e.key
          // Auto-clear buffer after 200ms of no input
          if (barcodeTimer.current) clearTimeout(barcodeTimer.current)
          barcodeTimer.current = setTimeout(() => {
            barcodeBuffer.current = ''
          }, 200)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [products]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName
      const inInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA'

      if (e.key === 'F2') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'F3') {
        e.preventDefault()
        setShowBarcodeScanner(true)
      } else if (e.key === 'Escape') {
        // Close any open modal / panel
        if (showBarcodeScanner) {
          setShowBarcodeScanner(false)
        } else if (showCheckout) {
          setShowCheckout(false)
        } else if (showCustomerSearch) {
          setShowCustomerSearch(false)
        } else if (showHeldOrders) {
          setShowHeldOrders(false)
        } else if (document.activeElement === searchRef.current) {
          setSearch('')
          searchRef.current?.blur()
        }
      } else if (e.key === '/' && !inInput) {
        // Focus search when not already in an input
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [cart.length, showBarcodeScanner, showCheckout, showCustomerSearch, showHeldOrders])

  // ── Hold / Recall helpers ─────────────────────────────────────────────────
  const saveHeldOrders = (orders: HeldOrder[]) => {
    setHeldOrders(orders)
    localStorage.setItem(HELD_ORDERS_KEY, JSON.stringify(orders))
  }

  const holdOrder = () => {
    if (cart.length === 0) return
    const existing = heldOrders
    if (existing.length >= MAX_HELD_ORDERS) {
      setSuccessMsg('⚠ Max 5 held orders reached. Recall or delete one first.')
      setTimeout(() => setSuccessMsg(''), 2500)
      return
    }
    const held: HeldOrder = {
      id: `held-${Date.now()}`,
      timestamp: Date.now(),
      items: cart,
      customerName: selectedCustomer?.name ?? null,
      customerId: selectedCustomer?.id ?? null,
      note: '',
      discountType: discountValue ? discountType : null,
      discountValue: parseFloat(discountValue) || 0,
    }
    saveHeldOrders([...existing, held])
    clearCart()
    setSelectedCustomer(null)
    setRedeemPoints(false)
    setDiscountValue('')
    setSuccessMsg('✓ Order held')
    setTimeout(() => setSuccessMsg(''), 2000)
  }

  const recallOrder = (held: HeldOrder) => {
    // Restore cart, customer, discount
    setCart(held.items)
    if (held.customerId) {
      setSelectedCustomer({
        id: held.customerId,
        name: held.customerName ?? '',
        phone: null,
        points: 0,
      })
    }
    if (held.discountType) {
      setDiscountType(held.discountType)
      setDiscountValue(String(held.discountValue))
    }
    // Remove from held list
    saveHeldOrders(heldOrders.filter(h => h.id !== held.id))
    setShowHeldOrders(false)
    setSuccessMsg('✓ Order recalled')
    setTimeout(() => setSuccessMsg(''), 2000)
  }

  const deleteHeldOrder = (id: string) => {
    saveHeldOrders(heldOrders.filter(h => h.id !== id))
  }

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = !selectedCategory || p.category?.id === selectedCategory
    return matchSearch && matchCat
  })

  const filteredBundles = bundles.filter(
    b => b.name.toLowerCase().includes(search.toLowerCase()) && !selectedCategory,
  )

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0)
  const taxAmt = Math.round(subtotal * taxRate)
  const baseTotal = subtotal + taxAmt
  // Points redemption: 1 point = Rp 100, max redeem = all customer points
  const maxRedeemablePoints = selectedCustomer?.points ?? 0
  const pointsDiscount = redeemPoints ? Math.min(maxRedeemablePoints * 100, baseTotal) : 0
  const pointsRedeemed = redeemPoints ? Math.floor(pointsDiscount / 100) : 0
  const total = baseTotal - pointsDiscount - manualDiscountAmt()
  const addToCart = useCallback((product: Product) => {
    if (product.trackStock && product.stock <= 0) return
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id)
      if (existing) {
        return prev.map(i =>
          i.productId === product.id
            ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price }
            : i,
        )
      }
      return [
        ...prev,
        {
          id: `${product.id}-${Date.now()}`,
          productId: product.id,
          name: product.name,
          price: product.price,
          qty: 1,
          subtotal: product.price,
        },
      ]
    })
    // On mobile, briefly flash cart count — don't auto-switch tab so user can keep adding
  }, [])

  const addBundleToCart = useCallback((bundle: Bundle) => {
    setCart(prev => {
      let updated = [...prev]
      for (const item of bundle.items) {
        if (!item.product) continue
        if (item.product.trackStock && item.product.stock <= 0) continue
        const existing = updated.find(i => i.productId === item.productId)
        if (existing) {
          updated = updated.map(i =>
            i.productId === item.productId
              ? { ...i, qty: i.qty + item.qty, subtotal: (i.qty + item.qty) * i.price }
              : i,
          )
        } else {
          updated.push({
            id: `${bundle.id}-${item.productId}-${Date.now()}`,
            productId: item.productId,
            name: item.product.name,
            price: item.product.price,
            qty: item.qty,
            subtotal: item.product.price * item.qty,
            bundleId: bundle.id,
          })
        }
      }
      return updated
    })
  }, [])

  const handleBarcodeScan = useCallback(
    (barcode: string) => {
      const product = products.find(p => p.barcode === barcode)
      if (product) {
        if (product.trackStock && product.stock <= 0) {
          setSuccessMsg(`⚠ ${product.name} habis stok`)
        } else {
          addToCart(product)
          setSuccessMsg(`✓ Ditambahkan: ${product.name}`)
        }
      } else {
        setSuccessMsg(`✗ Barcode tidak ditemukan: ${barcode}`)
      }
      setTimeout(() => setSuccessMsg(''), 2500)
    },
    [products, addToCart],
  )

  const updateQty = useCallback((id: string, qty: number) => {
    setCart(prev =>
      qty <= 0
        ? prev.filter(i => i.id !== id)
        : prev.map(i => (i.id === id ? { ...i, qty, subtotal: qty * i.price } : i)),
    )
  }, [])

  const removeItem = useCallback((id: string) => {
    setCart(prev => prev.filter(i => i.id !== id))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  const handleOrderSuccess = (order: ReceiptData) => {
    clearCart()
    setShowCheckout(false)
    setSelectedCustomer(null)
    setRedeemPoints(false)
    setShowCustomerSearch(false)
    setDiscountValue('')
    setOrderNote('')
    setReceiptData(order)
  }

  const handleReceiptClose = (orderNumber: string) => {
    setReceiptData(null)
    const earned = (receiptData as any)?.pointsEarned
    const suffix = earned ? ` (+${earned} pts earned)` : ''
    setSuccessMsg(`Order ${orderNumber} paid!${suffix}`)
    setTimeout(() => setSuccessMsg(''), 3500)
  }

  const cartCount = cart.reduce((s, i) => s + i.qty, 0)
  const [mobileTab, setMobileTab] = useState<'products' | 'cart'>('products')

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] overflow-hidden bg-[#fffdf7]">
      {/* ── Mobile tab switcher (top) ── */}
      <div className="absolute top-14 right-0 left-0 z-20 flex border-b border-[var(--border)] bg-[var(--bg-card)] shadow-sm lg:hidden">
        <button
          onClick={() => setMobileTab('products')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors',
            mobileTab === 'products'
              ? 'border-b-2 border-amber-500 text-amber-600'
              : 'text-[var(--text-3)]',
          )}
        >
          <Grid3x3 className="h-4 w-4" /> Produk
        </button>
        <button
          onClick={() => setMobileTab('cart')}
          className={cn(
            'relative flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors',
            mobileTab === 'cart'
              ? 'border-b-2 border-amber-500 text-amber-600'
              : 'text-[var(--text-3)]',
          )}
        >
          <ShoppingCart className="h-4 w-4" />
          Keranjang
          {cartCount > 0 && (
            <span className="absolute top-1.5 right-6 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Left: Product Grid ── */}
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col overflow-hidden',
          // On mobile: show/hide based on tab, with top padding for tab bar
          'max-lg:absolute max-lg:inset-0 max-lg:top-[calc(3.5rem+41px)]',
          mobileTab === 'products' ? 'max-lg:flex' : 'max-lg:hidden',
          // Desktop: always visible
          'lg:relative lg:flex',
        )}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari produk…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2 pr-12 pl-9 text-sm text-[var(--text-1)] placeholder-stone-400 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 focus:outline-none"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-[var(--border)] bg-[var(--bg-muted)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-3)]">
              F2
            </kbd>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'grid'
                  ? 'bg-amber-500 text-white'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-3)] hover:text-[var(--text-1)]',
              )}
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'list'
                  ? 'bg-amber-500 text-white'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-3)] hover:text-[var(--text-1)]',
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          {/* Camera barcode scanner button */}
          <button
            onClick={() => setShowBarcodeScanner(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 transition-colors hover:border-amber-400/60 hover:bg-amber-500/10"
            title="Buka kamera scanner"
          >
            <Scan className="h-3.5 w-3.5 text-amber-600" />
            <span className="hidden text-[10px] font-medium text-amber-600 sm:block">Scan</span>
          </button>
          {/* HID scanner indicator */}
          <div
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5"
            title="USB/Bluetooth barcode scanner ready"
          >
            <ScanBarcode className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden text-[10px] font-medium text-emerald-600 sm:block">HID</span>
          </div>
        </div>

        {/* Category filter */}
        <div className="scrollbar-hide flex gap-2 overflow-x-auto border-b border-[var(--border)] px-4 py-2.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              'flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              !selectedCategory
                ? 'bg-amber-500 text-white'
                : 'bg-[var(--bg-subtle)] text-[var(--text-2)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]',
            )}
          >
            Semua
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              className={cn(
                'flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                selectedCategory === cat.id
                  ? 'bg-amber-500 text-white'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-2)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]',
              )}
            >
              {cat.icon && <span>{cat.icon}</span>}
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 && filteredBundles.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-[var(--text-3)]">
              <Search className="mb-3 h-10 w-10" />
              <p className="text-sm">Produk tidak ditemukan</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredBundles.map(b => (
                <BundleCard key={b.id} bundle={b} currency={currency} onAdd={addBundleToCart} />
              ))}
              {filtered.map(p => (
                <ProductCard key={p.id} product={p} currency={currency} onAdd={addToCart} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-[var(--border)]">
              {filteredBundles.map(b => (
                <BundleRow key={b.id} bundle={b} currency={currency} onAdd={addBundleToCart} />
              ))}
              {filtered.map(p => (
                <ProductRow key={p.id} product={p} currency={currency} onAdd={addToCart} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Cart ── */}
      <div
        className={cn(
          'flex flex-col border-l border-[var(--border)] bg-[var(--bg-card)]',
          // Desktop: fixed width sidebar
          'lg:w-80 lg:shrink-0 xl:w-96',
          // Mobile: full screen tab panel
          'max-lg:absolute max-lg:inset-0 max-lg:top-[calc(3.5rem+41px)] max-lg:w-full max-lg:border-l-0',
          mobileTab === 'cart' ? 'max-lg:flex' : 'max-lg:hidden',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
          <h2 className="text-sm font-semibold text-[var(--text-1)]">Pesanan</h2>
          <div className="flex items-center gap-2">
            {/* Recall button */}
            <button
              onClick={() => setShowHeldOrders(v => !v)}
              className={cn(
                'relative flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors',
                heldOrders.length > 0
                  ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25'
                  : 'bg-[var(--bg-muted)] text-[var(--text-3)] hover:text-[var(--text-2)]',
              )}
              title="Recall held order"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Recall</span>
              {heldOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-bold text-white">
                  {heldOrders.length}
                </span>
              )}
            </button>
            {/* Hold button */}
            {cart.length > 0 && (
              <button
                onClick={holdOrder}
                className="flex items-center gap-1 rounded-lg bg-[var(--bg-muted)] px-2 py-1 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-stone-200 hover:text-[var(--text-1)]"
                title="Hold current order"
              >
                <PauseCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Hold</span>
              </button>
            )}
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-red-400 transition-colors hover:text-red-300"
              >
                Hapus semua
              </button>
            )}
          </div>
        </div>

        {/* Held orders panel */}
        {showHeldOrders && (
          <div className="border-b border-[var(--border)] bg-amber-500/5">
            <div className="flex items-center justify-between px-4 py-2">
              <p className="text-xs font-semibold tracking-wider text-[var(--text-2)] uppercase">
                Held Orders ({heldOrders.length}/{MAX_HELD_ORDERS})
              </p>
              <button
                onClick={() => setShowHeldOrders(false)}
                className="text-[var(--text-3)] hover:text-[var(--text-2)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {heldOrders.length === 0 ? (
              <p className="py-3 text-center text-xs text-[var(--text-3)]">No held orders</p>
            ) : (
              <div className="max-h-48 divide-y divide-[var(--border)] overflow-y-auto">
                {heldOrders.map(h => (
                  <div key={h.id} className="flex items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-[var(--text-1)]">
                        {h.items.length} item{h.items.length !== 1 ? 's' : ''}
                        {h.customerName ? ` · ${h.customerName}` : ''}
                      </p>
                      <p className="text-[10px] text-[var(--text-3)]">
                        {new Date(h.timestamp).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' · '}
                        {fmt(
                          h.items.reduce((s, i) => s + i.subtotal, 0),
                          currency,
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => recallOrder(h)}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-amber-600"
                    >
                      <PlayCircle className="h-3 w-3" /> Recall
                    </button>
                    <button
                      onClick={() => deleteHeldOrder(h.id)}
                      className="shrink-0 text-stone-300 transition-colors hover:text-red-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-stone-300">
              <CreditCard className="h-12 w-12" />
              <p className="text-sm">Tambah produk untuk mulai pesanan</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {cart.map(item => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-1)]">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-3)]">
                        {fmt(item.price, currency)} / pcs
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="mt-0.5 text-stone-300 transition-colors hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateQty(item.id, item.qty - 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--bg-muted)] text-[var(--text-2)] transition-colors hover:bg-stone-200"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium text-[var(--text-1)]">
                        {item.qty}
                      </span>
                      <button
                        onClick={() => updateQty(item.id, item.qty + 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--bg-muted)] text-[var(--text-2)] transition-colors hover:bg-stone-200"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="text-sm font-semibold text-[var(--text-1)]">
                      {fmt(item.subtotal, currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order note (Catatan) */}
        {cart.length > 0 && (
          <div className="px-4 pb-2">
            <textarea
              value={orderNote}
              onChange={e => setOrderNote(e.target.value)}
              placeholder="Catatan pesanan…"
              rows={2}
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-1)] placeholder-stone-400 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 focus:outline-none"
            />
          </div>
        )}

        {/* Customer selector + Summary + Checkout */}
        {cart.length > 0 && (
          <div className="space-y-3 border-t border-[var(--border)] p-4">
            {/* Customer section */}
            {!selectedCustomer ? (
              <div>
                {!showCustomerSearch ? (
                  <button
                    onClick={() => setShowCustomerSearch(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 py-2 text-xs text-[var(--text-3)] transition-colors hover:border-white/40 hover:text-[var(--text-2)]"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add Customer
                  </button>
                ) : (
                  <CustomerSearch
                    storeId={storeId}
                    onSelect={c => {
                      setSelectedCustomer(c)
                      setShowCustomerSearch(false)
                    }}
                    onClose={() => setShowCustomerSearch(false)}
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-lg bg-[var(--bg-subtle)] px-3 py-2">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-xs font-medium text-[var(--text-1)]">
                      {selectedCustomer.name}
                    </p>
                    <p className="flex items-center gap-0.5 text-[10px] text-[var(--text-3)]">
                      <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                      {selectedCustomer.points} poin
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedCustomer(null)
                    setRedeemPoints(false)
                  }}
                  className="text-[var(--text-3)] transition-colors hover:text-[var(--text-2)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Redeem points toggle */}
            {selectedCustomer && selectedCustomer.points > 0 && (
              <button
                onClick={() => setRedeemPoints(r => !r)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors',
                  redeemPoints
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                    : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)] hover:border-stone-300 hover:text-[var(--text-1)]',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Star
                    className={cn('h-3 w-3', redeemPoints ? 'fill-amber-400 text-amber-400' : '')}
                  />
                  Tukar {maxRedeemablePoints} poin = {fmt(maxRedeemablePoints * 100, currency)}{' '}
                  diskon
                </span>
                <span
                  className={cn(
                    'font-medium',
                    redeemPoints ? 'text-amber-400' : 'text-[var(--text-3)]',
                  )}
                >
                  {redeemPoints ? 'ON' : 'OFF'}
                </span>
              </button>
            )}

            {/* Totals */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm text-[var(--text-2)]">
                <span>Subtotal</span>
                <span>{fmt(subtotal, currency)}</span>
              </div>
              {taxRate > 0 && (
                <div className="flex justify-between text-sm text-[var(--text-2)]">
                  <span>Pajak ({(taxRate * 100).toFixed(0)}%)</span>
                  <span>{fmt(taxAmt, currency)}</span>
                </div>
              )}
              {redeemPoints && pointsDiscount > 0 && (
                <div className="flex justify-between text-sm text-amber-400">
                  <span>Diskon poin ({pointsRedeemed} poin)</span>
                  <span>-{fmt(pointsDiscount, currency)}</span>
                </div>
              )}
              {manualDiscountAmt() > 0 && (
                <div className="flex justify-between text-sm text-emerald-500">
                  <span>Diskon manual</span>
                  <span>-{fmt(manualDiscountAmt(), currency)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-[var(--border)] pt-1 text-base font-bold text-[var(--text-1)]">
                <span>Total</span>
                <span>{fmt(total, currency)}</span>
              </div>
            </div>

            {/* Manual discount */}
            <div className="flex items-center gap-2">
              <div className="flex shrink-0 overflow-hidden rounded-lg border border-[var(--border)]">
                <button
                  onClick={() => setDiscountType('PERCENT')}
                  className={cn(
                    'px-2 py-1.5 text-xs font-medium transition-colors',
                    discountType === 'PERCENT'
                      ? 'bg-amber-500 text-white'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-3)] hover:text-[var(--text-2)]',
                  )}
                >
                  <Percent className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setDiscountType('FLAT')}
                  className={cn(
                    'px-2 py-1.5 text-xs font-medium transition-colors',
                    discountType === 'FLAT'
                      ? 'bg-amber-500 text-white'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-3)] hover:text-[var(--text-2)]',
                  )}
                >
                  <Tag className="h-3 w-3" />
                </button>
              </div>
              <div className="relative flex-1">
                <input
                  type="number"
                  min="0"
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'PERCENT' ? 'Diskon %' : 'Diskon flat'}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-1.5 pr-3 pl-3 text-xs text-[var(--text-1)] placeholder-stone-400 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 focus:outline-none"
                />
              </div>
              {discountValue && (
                <button
                  onClick={() => setDiscountValue('')}
                  className="shrink-0 text-stone-300 transition-colors hover:text-red-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCheckout(true)}
                className="mt-1 flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 transition-opacity hover:opacity-90"
              >
                <span>Bayar — {fmt(total, currency)}</span>
                <kbd className="rounded border border-white/30 bg-[var(--bg-card)]/20 px-1.5 py-0.5 font-mono text-[10px]">
                  F2
                </kbd>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Barcode Scanner Modal ── */}
      <BarcodeScanner
        active={showBarcodeScanner}
        onScan={barcode => {
          handleBarcodeScan(barcode)
          setShowBarcodeScanner(false)
        }}
        onClose={() => setShowBarcodeScanner(false)}
      />

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
          customerId={selectedCustomer?.id}
          pointsRedeemed={pointsRedeemed}
          pointsDiscount={pointsDiscount}
          manualDiscountAmt={manualDiscountAmt()}
          note={orderNote}
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

      {/* ── Keyboard shortcut help chip (desktop only) ── */}
      <div className="pointer-events-none fixed right-4 bottom-4 z-40 hidden items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 font-mono text-[10px] text-white/60 backdrop-blur-sm select-none lg:flex">
        <span>F2 Cari</span>
        <span className="text-white/20">·</span>
        <span>F3 Scan</span>
        <span className="text-white/20">·</span>
        <span>Esc Tutup</span>
      </div>

      {successMsg && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-2xl shadow-emerald-500/20">
          <span>✓</span> {successMsg}
        </div>
      )}
    </div>
  )
}

// ─── Customer Search ──────────────────────────────────────────────────────────

function CustomerSearch({
  storeId,
  onSelect,
  onClose,
}: {
  storeId: string
  onSelect: (c: Customer) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/customers?storeId=${storeId}&q=${encodeURIComponent(q)}&limit=5`,
        )
        if (res.ok) {
          const data = (await res.json()) as any
          setResults(Array.isArray(data) ? data : (data.customers ?? []))
        }
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [q, storeId])

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search customer name or phone…"
          className="flex-1 bg-transparent text-xs text-[var(--text-1)] placeholder-stone-400 focus:outline-none"
        />
        <button
          onClick={onClose}
          className="text-[var(--text-3)] transition-colors hover:text-[var(--text-2)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {loading && (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--text-3)]" />
        </div>
      )}
      {!loading && q.trim() && results.length === 0 && (
        <p className="py-3 text-center text-xs text-[var(--text-3)]">No customers found</p>
      )}
      {results.map(c => (
        <button
          key={c.id}
          onClick={() => onSelect(c)}
          className="flex w-full items-center justify-between border-t border-[var(--border)] px-3 py-2 text-left transition-colors first:border-t-0 hover:bg-[var(--bg-muted)]"
        >
          <div>
            <p className="text-xs font-medium text-[var(--text-1)]">{c.name}</p>
            {c.phone && <p className="text-[10px] text-[var(--text-3)]">{c.phone}</p>}
          </div>
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-amber-400">
            <Star className="h-2.5 w-2.5 fill-amber-400" />
            {c.points} pts
          </span>
        </button>
      ))}
    </div>
  )
}

// ─── Bundle Card ─────────────────────────────────────────────────────────────

function BundleCard({
  bundle,
  currency,
  onAdd,
}: {
  bundle: Bundle
  currency: string
  onAdd: (b: Bundle) => void
}) {
  const available = bundle.items.some(
    i => i.product && (!i.product.trackStock || i.product.stock >= i.qty),
  )
  return (
    <button
      onClick={() => available && onAdd(bundle)}
      disabled={!available}
      className={cn(
        'flex flex-col rounded-xl border p-3.5 text-left transition-all duration-150 active:scale-[0.97]',
        !available
          ? 'cursor-not-allowed border-[var(--border)] bg-[var(--bg-card)]/[0.02] opacity-40'
          : 'cursor-pointer border-amber-200 bg-amber-50/60 hover:border-amber-400 hover:bg-amber-500/10',
      )}
    >
      <div className="mb-3 flex aspect-square w-full items-center justify-center rounded-lg bg-amber-100/60 text-2xl">
        <Package className="h-7 w-7 text-amber-500" />
      </div>
      <div className="mb-1 flex items-start gap-1">
        <span className="mt-0.5 shrink-0 rounded bg-amber-500 px-1 py-0.5 text-[9px] leading-none font-bold tracking-wide text-white uppercase">
          Bundle
        </span>
        <p className="line-clamp-2 text-sm leading-tight font-medium text-[var(--text-1)]">
          {bundle.name}
        </p>
      </div>
      <p className="mt-0.5 text-[10px] text-[var(--text-3)]">{bundle.items.length} produk</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-bold text-amber-600">
          {new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
          }).format(bundle.price)}
        </span>
      </div>
    </button>
  )
}

// ─── Bundle Row ───────────────────────────────────────────────────────────────

function BundleRow({
  bundle,
  currency,
  onAdd,
}: {
  bundle: Bundle
  currency: string
  onAdd: (b: Bundle) => void
}) {
  const available = bundle.items.some(
    i => i.product && (!i.product.trackStock || i.product.stock >= i.qty),
  )
  return (
    <button
      onClick={() => available && onAdd(bundle)}
      disabled={!available}
      className={cn(
        'flex w-full items-center gap-4 px-4 py-3 text-left transition-colors',
        !available ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-amber-50',
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
        <Package className="h-5 w-5 text-amber-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-amber-500 px-1 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
            Bundle
          </span>
          <p className="truncate text-sm font-medium text-[var(--text-1)]">{bundle.name}</p>
        </div>
        <p className="text-xs text-[var(--text-3)]">{bundle.items.length} produk</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold text-amber-600">
          {new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
          }).format(bundle.price)}
        </p>
      </div>
    </button>
  )
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  currency,
  onAdd,
}: {
  product: Product
  currency: string
  onAdd: (p: Product) => void
}) {
  const outOfStock = product.trackStock && product.stock <= 0
  const lowStock = product.trackStock && product.stock > 0 && product.stock <= 5

  return (
    <button
      onClick={() => !outOfStock && onAdd(product)}
      disabled={outOfStock}
      className={cn(
        'flex flex-col rounded-xl border p-3.5 text-left transition-all duration-150 active:scale-[0.97]',
        outOfStock
          ? 'cursor-not-allowed border-[var(--border)] bg-[var(--bg-card)]/[0.02] opacity-40'
          : 'cursor-pointer border-[var(--border)] bg-[var(--bg-subtle)] hover:border-amber-400/60 hover:bg-amber-500/10',
      )}
    >
      {product.category?.color && (
        <div
          className="mb-2 h-1.5 w-1.5 rounded-full"
          style={{ background: product.category.color }}
        />
      )}
      <div className="mb-3 flex aspect-square w-full items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-2xl">
        {product.category?.icon || '📦'}
      </div>
      <p className="line-clamp-2 text-sm leading-tight font-medium text-[var(--text-1)]">
        {product.name}
      </p>
      {product.category && (
        <p className="mt-0.5 text-[10px] text-[var(--text-3)]">
          {product.category.icon} {product.category.name}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-bold text-amber-600">
          {new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
          }).format(product.price)}
        </span>
        {product.trackStock && (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-medium',
              outOfStock
                ? 'bg-red-500/20 text-red-400'
                : lowStock
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-[var(--bg-muted)] text-[var(--text-3)]',
            )}
          >
            {outOfStock ? 'Out' : `${product.stock}`}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Product Row ──────────────────────────────────────────────────────────────

function ProductRow({
  product,
  currency,
  onAdd,
}: {
  product: Product
  currency: string
  onAdd: (p: Product) => void
}) {
  const outOfStock = product.trackStock && product.stock <= 0

  return (
    <button
      onClick={() => !outOfStock && onAdd(product)}
      disabled={outOfStock}
      className={cn(
        'flex w-full items-center gap-4 px-4 py-3 text-left transition-colors',
        outOfStock ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-[var(--bg-subtle)]',
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-xl">
        {product.category?.icon || '📦'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text-1)]">{product.name}</p>
        <p className="text-xs text-[var(--text-3)]">{product.category?.name}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold text-amber-600">
          {new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
          }).format(product.price)}
        </p>
        {product.trackStock && (
          <p
            className={cn(
              'text-[10px]',
              product.stock <= 5 ? 'text-amber-400' : 'text-[var(--text-3)]',
            )}
          >
            {product.stock} left
          </p>
        )}
      </div>
    </button>
  )
}

// ─── Checkout Modal ───────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { id: 'CASH' as PaymentMethod, label: 'Cash', icon: Banknote, color: 'text-emerald-600' },
  { id: 'CARD' as PaymentMethod, label: 'Card', icon: CreditCard, color: 'text-violet-500' },
  { id: 'QRIS' as PaymentMethod, label: 'QRIS', icon: Smartphone, color: 'text-purple-400' },
  {
    id: 'TRANSFER' as PaymentMethod,
    label: 'Transfer',
    icon: ArrowLeftRight,
    color: 'text-orange-400',
  },
]

interface PaymentLine {
  method: PaymentMethod
  amount: string // string so input is controlled
}

function CheckoutModal({
  storeId,
  taxRate,
  currency,
  staffId,
  cart,
  subtotal,
  taxAmt,
  total,
  customerId,
  pointsRedeemed,
  pointsDiscount,
  manualDiscountAmt,
  note,
  onClose,
  onSuccess,
}: {
  storeId: string
  taxRate: number
  currency: string
  staffId: string
  cart: CartItem[]
  subtotal: number
  taxAmt: number
  total: number
  customerId?: string
  pointsRedeemed?: number
  pointsDiscount?: number
  manualDiscountAmt?: number
  note?: string
  onClose: () => void
  onSuccess: (order: ReceiptData) => void
}) {
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: 'CASH', amount: '' }])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  const canPay = totalPaid >= total && payments.every(p => (parseFloat(p.amount) || 0) > 0)

  // Change only applies to the cash portion
  const cashPaid = payments
    .filter(p => p.method === 'CASH')
    .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  const change = Math.max(0, totalPaid - total)
  const hasCash = payments.some(p => p.method === 'CASH')

  const quickAmounts = (lineTotal: number) =>
    [
      Math.ceil(lineTotal / 10000) * 10000,
      Math.ceil(lineTotal / 50000) * 50000,
      Math.ceil(lineTotal / 100000) * 100000,
    ]
      .filter((v, i, a) => a.indexOf(v) === i && v >= lineTotal)
      .slice(0, 3)

  const updateLine = (idx: number, field: keyof PaymentLine, value: string) => {
    setPayments(prev => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)))
  }

  const addLine = () => {
    setPayments(prev => [...prev, { method: 'QRIS', amount: '' }])
  }

  const removeLine = (idx: number) => {
    setPayments(prev => prev.filter((_, i) => i !== idx))
  }

  const handlePay = async () => {
    if (!canPay) {
      setError('Total paid must cover the order total')
      return
    }
    if (payments.some(p => (parseFloat(p.amount) || 0) <= 0)) {
      setError('Each payment line must have an amount greater than 0')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          userId: staffId,
          customerId: customerId ?? null,
          pointsRedeemed: pointsRedeemed ?? 0,
          note: note ?? '',
          items: cart.map(i => ({
            productId: i.productId,
            name: i.name,
            price: i.price,
            qty: i.qty,
            discount: 0,
            subtotal: i.subtotal,
          })),
          payments: payments.map(p => ({
            method: p.method,
            amount: parseFloat(p.amount) || 0,
            change:
              p.method === 'CASH'
                ? Math.max(
                    0,
                    (parseFloat(p.amount) || 0) -
                      (total - (totalPaid - (parseFloat(p.amount) || 0))),
                  )
                : 0,
          })),
          subtotal,
          taxAmt,
          total,
          discountAmt: (pointsDiscount ?? 0) + (manualDiscountAmt ?? 0),
        }),
      })
      const data = (await res.json()) as any
      if (!res.ok) {
        setError(data.error || 'Payment failed')
        return
      }
      onSuccess(data as ReceiptData)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--text-1)]">Payment</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[80vh] space-y-5 overflow-y-auto p-6">
          {/* Order summary */}
          <div className="space-y-1.5 rounded-xl bg-[var(--bg-subtle)] p-4">
            <div className="flex justify-between text-sm text-[var(--text-2)]">
              <span>Subtotal</span>
              <span>{fmt(subtotal, currency)}</span>
            </div>
            {taxAmt > 0 && (
              <div className="flex justify-between text-sm text-[var(--text-2)]">
                <span>Pajak</span>
                <span>{fmt(taxAmt, currency)}</span>
              </div>
            )}
            {!!pointsRedeemed && (
              <div className="flex justify-between text-sm text-amber-400">
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-amber-400" />
                  Points ({pointsRedeemed} pts)
                </span>
                <span>-{fmt(pointsRedeemed * 100, currency)}</span>
              </div>
            )}
            {!!manualDiscountAmt && manualDiscountAmt > 0 && (
              <div className="flex justify-between text-sm text-emerald-500">
                <span>Diskon manual</span>
                <span>-{fmt(manualDiscountAmt, currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-base font-bold text-[var(--text-1)]">
              <span>Total</span>
              <span>{fmt(total, currency)}</span>
            </div>
          </div>

          {/* Split payment lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium tracking-wider text-[var(--text-2)] uppercase">
                Metode Pembayaran
              </p>
              {payments.length < 4 && (
                <button
                  onClick={addLine}
                  className="flex items-center gap-1 text-xs font-medium text-amber-600 transition-colors hover:text-amber-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah pembayaran
                </button>
              )}
            </div>

            {payments.map((line, idx) => (
              <div
                key={idx}
                className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3"
              >
                {/* Method selector row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="grid flex-1 grid-cols-4 gap-1.5">
                    {PAYMENT_METHODS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => updateLine(idx, 'method', m.id)}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-lg border py-2 text-[10px] font-medium transition-all',
                          line.method === m.id
                            ? 'border-amber-500/60 bg-amber-500/15 text-amber-700'
                            : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-3)] hover:border-stone-300 hover:text-[var(--text-1)]',
                        )}
                      >
                        <m.icon className={cn('h-4 w-4', line.method === m.id ? m.color : '')} />
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {payments.length > 1 && (
                    <button
                      onClick={() => removeLine(idx)}
                      className="shrink-0 text-stone-300 transition-colors hover:text-red-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Amount input */}
                <input
                  type="number"
                  value={line.amount}
                  onChange={e => updateLine(idx, 'amount', e.target.value)}
                  placeholder={fmt(payments.length === 1 ? total : 0, currency)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text-1)] focus:border-amber-400/60 focus:outline-none"
                />

                {/* Quick amounts for single-line cash */}
                {line.method === 'CASH' && payments.length === 1 && (
                  <div className="flex gap-2">
                    {quickAmounts(total).map(a => (
                      <button
                        key={a}
                        onClick={() => updateLine(idx, 'amount', String(a))}
                        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-1 text-[10px] text-[var(--text-2)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]"
                      >
                        {fmt(a, currency)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Running total */}
            <div className="flex justify-between px-1 text-sm">
              <span className="text-[var(--text-2)]">Dibayar</span>
              <span
                className={cn(
                  'font-semibold',
                  totalPaid >= total ? 'text-emerald-600' : 'text-red-400',
                )}
              >
                {fmt(totalPaid, currency)} / {fmt(total, currency)}
              </span>
            </div>

            {/* Change (cash portion) */}
            {totalPaid >= total && hasCash && change > 0 && (
              <div className="flex justify-between px-1 text-sm font-medium">
                <span className="text-[var(--text-2)]">Kembalian</span>
                <span className="text-emerald-600">{fmt(change, currency)}</span>
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          )}

          <button
            onClick={handlePay}
            disabled={loading || !canPay}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Processing…' : `Pay ${fmt(total, currency)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
