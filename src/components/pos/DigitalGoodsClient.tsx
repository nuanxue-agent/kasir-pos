'use client'

import { useState, useEffect, useCallback } from 'react'
import { Smartphone, Gift, Gamepad2, Wifi, Zap, Plus, X, Loader2, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = 'TOPUP' | 'EVOUCHER' | 'GAME_CREDIT' | 'INTERNET' | 'ELECTRICITY'
type SaleStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

interface DigitalProduct {
  id: string
  storeId: string
  name: string
  category: Category
  denomination: number
  price: number
  margin: number
  provider: string
  active: boolean
  createdAt: string
  updatedAt: string
}

interface DigitalSale {
  id: string
  storeId: string
  orderId: string | null
  productId: string
  productName: string
  category: Category
  denomination: number
  provider: string
  customerPhone: string
  serialNumber: string | null
  status: SaleStatus
  processedAt: string | null
  createdAt: string
  updatedAt: string
}

interface DigitalGoodsClientProps {
  storeId: string
  currency: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { value: Category; label: string; icon: React.ReactNode }[] = [
  { value: 'TOPUP',       label: 'Mobile Top-Up',     icon: <Smartphone className="w-4 h-4" /> },
  { value: 'EVOUCHER',    label: 'E-Voucher',          icon: <Gift className="w-4 h-4" /> },
  { value: 'GAME_CREDIT', label: 'Game Credits',       icon: <Gamepad2 className="w-4 h-4" /> },
  { value: 'INTERNET',    label: 'Internet Package',   icon: <Wifi className="w-4 h-4" /> },
  { value: 'ELECTRICITY', label: 'Electricity Token',  icon: <Zap className="w-4 h-4" /> },
]

const STATUS_CONFIG: Record<SaleStatus, { label: string; className: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pending',  className: 'text-yellow-600 bg-yellow-50', icon: <Clock className="w-3 h-3" /> },
  SUCCESS: { label: 'Success',  className: 'text-green-600 bg-green-50',   icon: <CheckCircle className="w-3 h-3" /> },
  FAILED:  { label: 'Failed',   className: 'text-red-600 bg-red-50',       icon: <XCircle className="w-3 h-3" /> },
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DigitalGoodsClient({ storeId, currency }: DigitalGoodsClientProps) {
  const [activeTab, setActiveTab] = useState<'sell' | 'products' | 'report'>('sell')
  const [products, setProducts] = useState<DigitalProduct[]>([])
  const [sales, setSales] = useState<DigitalSale[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<Category | 'ALL'>('ALL')

  // Sell form
  const [selectedProduct, setSelectedProduct] = useState<DigitalProduct | null>(null)
  const [customerPhone, setCustomerPhone] = useState('')
  const [selling, setSelling] = useState(false)

  // Product form
  const [showProductForm, setShowProductForm] = useState(false)
  const [productForm, setProductForm] = useState({ name: '', category: 'TOPUP' as Category, denomination: '', price: '', margin: '', provider: '' })
  const [savingProduct, setSavingProduct] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [prodRes, saleRes] = await Promise.all([
        fetch(`/api/digital-products?storeId=${storeId}&active=1`),
        fetch(`/api/digital-sales?storeId=${storeId}`),
      ])
      const prodData = await prodRes.json() as any
      const saleData = await saleRes.json() as any
      if (!Array.isArray(prodData)) { toast.error(prodData.error ?? 'Failed to load products'); return }
      if (!Array.isArray(saleData)) { toast.error(saleData.error ?? 'Failed to load sales'); return }
      setProducts(prodData)
      setSales(saleData)
    } catch {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filteredProducts = selectedCategory === 'ALL'
    ? products
    : products.filter(p => p.category === selectedCategory)

  const handleSell = async () => {
    if (!selectedProduct) { toast.error('Select a product'); return }
    if (!customerPhone.trim()) { toast.error('Customer phone is required'); return }
    setSelling(true)
    try {
      const res = await fetch(`/api/digital-sales?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selectedProduct.id, customerPhone: customerPhone.trim() }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Sale recorded — processing')
      setSelectedProduct(null)
      setCustomerPhone('')
      fetchAll()
    } finally {
      setSelling(false)
    }
  }

  const handleSaveProduct = async () => {
    if (!productForm.name.trim()) { toast.error('Product name is required'); return }
    if (!productForm.price) { toast.error('Price is required'); return }
    setSavingProduct(true)
    try {
      const res = await fetch(`/api/digital-products?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: productForm.name.trim(),
          category: productForm.category,
          denomination: Number(productForm.denomination) || 0,
          price: Number(productForm.price),
          margin: Number(productForm.margin) || 0,
          provider: productForm.provider.trim(),
        }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Product saved')
      setShowProductForm(false)
      setProductForm({ name: '', category: 'TOPUP', denomination: '', price: '', margin: '', provider: '' })
      fetchAll()
    } finally {
      setSavingProduct(false)
    }
  }

  const handleToggleActive = async (product: DigitalProduct) => {
    const res = await fetch(`/api/digital-products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !product.active }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success(product.active ? 'Product deactivated' : 'Product activated')
    fetchAll()
  }

  // Report: aggregate by category
  const categoryReport = CATEGORIES.map(cat => {
    const catSales = sales.filter(s => s.category === cat.value && s.status === 'SUCCESS')
    return {
      ...cat,
      count: catSales.length,
      revenue: catSales.reduce((sum, s) => sum + (products.find(p => p.id === s.productId)?.price ?? 0), 0),
    }
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--primary)' }} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Digital Goods</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Mobile top-up, e-vouchers, game credits & more</p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-2)' }}>
        {(['sell', 'products', 'report'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn('px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize', activeTab === tab ? 'shadow-sm' : '')}
            style={activeTab === tab ? { background: 'var(--bg-card)', color: 'var(--text-1)' } : { color: 'var(--text-3)' }}
          >
            {tab === 'sell' ? 'Sell' : tab === 'products' ? 'Products' : 'Report'}
          </button>
        ))}
      </div>

      {/* ── Sell Tab ── */}
      {activeTab === 'sell' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: product picker */}
          <div className="lg:col-span-2 space-y-4">
            {/* Category filter */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={cn('px-3 py-1.5 rounded-full text-sm border transition-colors', selectedCategory === 'ALL' ? 'border-transparent' : '')}
                style={selectedCategory === 'ALL' ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : { borderColor: 'var(--border)', color: 'var(--text-2)' }}
              >
                All
              </button>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors')}
                  style={selectedCategory === cat.value ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : { borderColor: 'var(--border)', color: 'var(--text-2)' }}
                >
                  {cat.icon}{cat.label}
                </button>
              ))}
            </div>

            {/* Product grid */}
            {filteredProducts.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <p style={{ color: 'var(--text-3)' }}>No products found. Add some in the Products tab.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredProducts.map(product => {
                  const catInfo = CATEGORIES.find(c => c.value === product.category)
                  return (
                    <button
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className={cn('rounded-xl p-4 text-left border-2 transition-all')}
                      style={selectedProduct?.id === product.id
                        ? { borderColor: 'var(--primary)', background: 'var(--bg-card)' }
                        : { borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                    >
                      <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--primary)' }}>
                        {catInfo?.icon}
                        <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>{catInfo?.label}</span>
                      </div>
                      <p className="font-semibold text-sm mb-1" style={{ color: 'var(--text-1)' }}>{product.name}</p>
                      {product.provider && <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>{product.provider}</p>}
                      <p className="font-bold" style={{ color: 'var(--primary)' }}>{formatCurrency(product.price, currency)}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right: checkout */}
          <div className="rounded-xl p-5 space-y-4 h-fit" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Checkout</h2>

            {selectedProduct ? (
              <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--bg-2)' }}>
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{selectedProduct.name}</p>
                  <button onClick={() => setSelectedProduct(null)}><X className="w-4 h-4" style={{ color: 'var(--text-3)' }} /></button>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>{selectedProduct.provider}</p>
                <p className="font-bold" style={{ color: 'var(--primary)' }}>{formatCurrency(selectedProduct.price, currency)}</p>
              </div>
            ) : (
              <div className="rounded-lg p-3 text-center" style={{ background: 'var(--bg-2)' }}>
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>Select a product</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Customer Phone *</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="e.g. 08123456789"
                className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
            </div>

            <button
              onClick={handleSell}
              disabled={!selectedProduct || !customerPhone.trim() || selling}
              className="w-full rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
              style={{ background: 'var(--primary)', color: '#fff' }}
            >
              {selling ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {selling ? 'Processing...' : 'Process Sale'}
            </button>
          </div>
        </div>
      )}

      {/* ── Products Tab ── */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>{products.length} products</p>
            <button
              onClick={() => setShowProductForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--primary)', color: '#fff' }}
            >
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </div>

          {/* Add product form */}
          {showProductForm && (
            <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>New Digital Product</h3>
                <button onClick={() => setShowProductForm(false)}><X className="w-4 h-4" style={{ color: 'var(--text-3)' }} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Name *</label>
                  <input value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-sm border outline-none" style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }} placeholder="e.g. Telkomsel 50K" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Category *</label>
                  <select value={productForm.category} onChange={e => setProductForm(f => ({ ...f, category: e.target.value as Category }))} className="w-full rounded-lg px-3 py-2 text-sm border outline-none" style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Denomination (IDR)</label>
                  <input type="number" value={productForm.denomination} onChange={e => setProductForm(f => ({ ...f, denomination: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-sm border outline-none" style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }} placeholder="50000" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Selling Price *</label>
                  <input type="number" value={productForm.price} onChange={e => setProductForm(f => ({ ...f, price: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-sm border outline-none" style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }} placeholder="52000" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Margin (%)</label>
                  <input type="number" value={productForm.margin} onChange={e => setProductForm(f => ({ ...f, margin: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-sm border outline-none" style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }} placeholder="4" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Provider</label>
                  <input value={productForm.provider} onChange={e => setProductForm(f => ({ ...f, provider: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-sm border outline-none" style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }} placeholder="e.g. Telkomsel" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowProductForm(false)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>Cancel</button>
                <button onClick={handleSaveProduct} disabled={savingProduct} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: 'var(--primary)', color: '#fff' }}>
                  {savingProduct ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save Product
                </button>
              </div>
            </div>
          )}

          {/* Products table */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--bg-2)' }}>
                <tr>
                  {['Name', 'Category', 'Provider', 'Denomination', 'Price', 'Margin', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>No products yet</td></tr>
                ) : products.map((p, i) => (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-1)', borderTop: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-1)' }}>{p.name}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{CATEGORIES.find(c => c.value === p.category)?.label ?? p.category}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{p.provider || '—'}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{p.denomination ? formatCurrency(p.denomination, currency) : '—'}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-1)' }}>{formatCurrency(p.price, currency)}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{p.margin ? `${p.margin}%` : '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(p)}
                        className={cn('px-2 py-0.5 rounded-full text-xs font-medium')}
                        style={p.active ? { background: '#dcfce7', color: '#16a34a' } : { background: '#fee2e2', color: '#dc2626' }}
                      >
                        {p.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Report Tab ── */}
      {activeTab === 'report' && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {categoryReport.map(cat => (
              <div key={cat.value} className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2" style={{ color: 'var(--primary)' }}>
                  {cat.icon}
                  <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>{cat.label}</span>
                </div>
                <p className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>{cat.count}</p>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>{formatCurrency(cat.revenue, currency)}</p>
              </div>
            ))}
          </div>

          {/* Recent sales */}
          <div>
            <h2 className="font-semibold mb-3" style={{ color: 'var(--text-1)' }}>Recent Sales</h2>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--bg-2)' }}>
                  <tr>
                    {['Product', 'Category', 'Customer Phone', 'Serial Number', 'Status', 'Date'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sales.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>No sales yet</td></tr>
                  ) : sales.slice(0, 50).map((s, i) => {
                    const statusCfg = STATUS_CONFIG[s.status]
                    return (
                      <tr key={s.id} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-1)', borderTop: '1px solid var(--border)' }}>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-1)' }}>{s.productName ?? '—'}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{CATEGORIES.find(c => c.value === s.category)?.label ?? s.category}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{s.customerPhone}</td>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-2)' }}>{s.serialNumber ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={cn('flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-xs font-medium', statusCfg.className)}>
                            {statusCfg.icon}{statusCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>{new Date(s.createdAt).toLocaleDateString('id-ID')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
