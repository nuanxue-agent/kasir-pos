'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Zap, Plus, X, Loader2, RefreshCw, Clock, Tag, BarChart2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  detectSaleStatus,
  calcDiscountPct,
  calcStockRemaining,
  calcStockUsedPct,
  countdownSecondsRemaining,
  formatCountdown,
  validateSale,
  type SaleStatus,
} from '@/lib/flash-sales'

// Types
interface FlashSale {
  id: string
  storeId: string
  name: string
  startAt: string
  endAt: string
  status: SaleStatus
  createdAt: string
  updatedAt: string
}

interface FlashSaleItem {
  id: string
  saleId: string
  storeId: string
  productId: string
  originalPrice: number
  salePrice: number
  discountPct: number
  stockLimit: number
  soldQty: number
  active: boolean
}

interface FlashSaleClientProps {
  storeId: string
  currency: string
}

const STATUS_CONFIG: Record<SaleStatus, { label: string; bg: string; text: string }> = {
  SCHEDULED: { label: 'Scheduled', bg: '#eff6ff', text: '#2563eb' },
  ACTIVE:    { label: 'Active',    bg: '#f0fdf4', text: '#16a34a' },
  ENDED:     { label: 'Ended',     bg: '#f9fafb', text: '#6b7280' },
  CANCELLED: { label: 'Cancelled', bg: '#fef2f2', text: '#dc2626' },
}

function CountdownTimer({ endAt, status }: { endAt: string; status: SaleStatus }) {
  const [secs, setSecs] = useState(() => countdownSecondsRemaining(endAt))
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (status !== 'ACTIVE' && status !== 'SCHEDULED') return
    ref.current = setInterval(() => { setSecs(countdownSecondsRemaining(endAt)) }, 1000)
    return () => { if (ref.current) clearInterval(ref.current) }
  }, [endAt, status])
  if (status === 'ENDED' || status === 'CANCELLED') return <span style={{ color: 'var(--text-3)' }}>—</span>
  return (
    <span className="font-mono text-sm font-semibold" style={{ color: status === 'ACTIVE' ? '#16a34a' : '#2563eb' }}>
      {formatCountdown(secs)}
    </span>
  )
}

function StockBar({ stockLimit, soldQty }: { stockLimit: number; soldQty: number }) {
  if (stockLimit <= 0) return <span className="text-xs" style={{ color: 'var(--text-3)' }}>Unlimited</span>
  const pct = calcStockUsedPct(stockLimit, soldQty)
  const remaining = calcStockRemaining(stockLimit, soldQty)
  const color = pct >= 90 ? '#dc2626' : pct >= 60 ? '#f59e0b' : '#16a34a'
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-3)' }}>
        <span>{remaining} left</span><span>{pct}%</span>
      </div>
      <div className="w-full rounded-full h-1.5" style={{ background: 'var(--bg-2)' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export default function FlashSaleClient({ storeId, currency }: FlashSaleClientProps) {
  const [activeTab, setActiveTab] = useState<'sales' | 'new'>('sales')
  const [sales, setSales] = useState<FlashSale[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [itemsMap, setItemsMap] = useState<Record<string, FlashSaleItem[]>>({})
  const [itemsLoading, setItemsLoading] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', startAt: '', endAt: '' })
  const [saving, setSaving] = useState(false)
  const [itemForm, setItemForm] = useState<Record<string, { productId: string; originalPrice: string; salePrice: string; stockLimit: string }>>({})
  const [addingItem, setAddingItem] = useState<string | null>(null)
  const [showItemForm, setShowItemForm] = useState<string | null>(null)

  const fetchSales = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/flash-sales?storeId=${storeId}`)
      const data = await res.json() as any
      if (!Array.isArray(data)) { toast.error(data.error ?? 'Failed to load flash sales'); return }
      setSales(data)
    } catch { toast.error('Failed to load flash sales') }
    finally { setLoading(false) }
  }, [storeId])

  useEffect(() => { fetchSales() }, [fetchSales])

  const fetchItems = async (saleId: string) => {
    setItemsLoading(saleId)
    try {
      const res = await fetch(`/api/flash-sales/${saleId}/items`)
      const data = await res.json() as any
      if (!Array.isArray(data)) { toast.error(data.error ?? 'Failed to load items'); return }
      setItemsMap(m => ({ ...m, [saleId]: data }))
    } finally { setItemsLoading(null) }
  }

  const toggleExpand = (saleId: string) => {
    if (expanded === saleId) { setExpanded(null) }
    else { setExpanded(saleId); if (!itemsMap[saleId]) fetchItems(saleId) }
  }

  const handleCreateSale = async () => {
    const startISO = form.startAt ? new Date(form.startAt).toISOString() : ''
    const endISO   = form.endAt   ? new Date(form.endAt).toISOString()   : ''
    const v = validateSale(form.name, startISO, endISO)
    if (!v.valid) { toast.error(v.reason ?? 'Invalid sale'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/flash-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, name: form.name, startAt: startISO, endAt: endISO }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Flash sale created')
      setForm({ name: '', startAt: '', endAt: '' })
      setActiveTab('sales')
      fetchSales()
    } finally { setSaving(false) }
  }

  const handleUpdateStatus = async (id: string, status: SaleStatus) => {
    const res = await fetch(`/api/flash-sales/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success(`Sale ${status.toLowerCase()}`)
    fetchSales()
  }

  const handleAddItem = async (saleId: string) => {
    const f = itemForm[saleId]
    if (!f?.productId?.trim()) { toast.error('Product ID is required'); return }
    if (!f.originalPrice || !f.salePrice) { toast.error('Prices are required'); return }
    setAddingItem(saleId)
    try {
      const orig = Number(f.originalPrice)
      const sale = Number(f.salePrice)
      const res = await fetch(`/api/flash-sales/${saleId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: f.productId.trim(), originalPrice: orig, salePrice: sale, discountPct: calcDiscountPct(orig, sale), stockLimit: Number(f.stockLimit ?? 0) }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Item added')
      setItemForm(m => ({ ...m, [saleId]: { productId: '', originalPrice: '', salePrice: '', stockLimit: '' } }))
      setShowItemForm(null)
      fetchItems(saleId)
    } finally { setAddingItem(null) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--primary)' }} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary)' }}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Flash Sales</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>Time-limited deep-discount promotions</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchSales} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={() => setActiveTab('new')} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--primary)', color: '#fff' }}>
            <Plus className="w-4 h-4" /> New Sale
          </button>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-2)' }}>
        {(['sales', 'new'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn('px-4 py-2 rounded-md text-sm font-medium transition-colors', activeTab === tab ? 'shadow-sm' : '')}
            style={activeTab === tab ? { background: 'var(--bg-card)', color: 'var(--text-1)' } : { color: 'var(--text-3)' }}>
            {tab === 'sales' ? 'All Sales' : 'Create New'}
          </button>
        ))}
      </div>

      {activeTab === 'sales' && (
        <div className="space-y-3">
          {sales.length === 0 ? (
            <div className="rounded-xl p-12 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <Zap className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-3)' }} />
              <p className="font-medium" style={{ color: 'var(--text-1)' }}>No flash sales yet</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Create your first time-limited promotion</p>
              <button onClick={() => setActiveTab('new')} className="mt-4 px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--primary)', color: '#fff' }}>
                Create Flash Sale
              </button>
            </div>
          ) : sales.map(sale => {
            const computed = detectSaleStatus(sale.startAt, sale.endAt)
            const cfg = STATUS_CONFIG[computed]
            const isOpen = expanded === sale.id
            const items = itemsMap[sale.id] ?? []
            return (
              <div key={sale.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.text }}>{cfg.label}</span>
                        {computed === 'ACTIVE' && <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-3)' }}><Clock className="w-3 h-3" /> ends in</span>}
                        <CountdownTimer endAt={sale.endAt} status={computed} />
                      </div>
                      <p className="font-semibold truncate" style={{ color: 'var(--text-1)' }}>{sale.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                        {new Date(sale.startAt).toLocaleString('id-ID')} — {new Date(sale.endAt).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {computed === 'SCHEDULED' && (
                        <button onClick={() => handleUpdateStatus(sale.id, 'ACTIVE')} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#f0fdf4', color: '#16a34a' }}>Activate</button>
                      )}
                      {computed === 'ACTIVE' && (
                        <button onClick={() => handleUpdateStatus(sale.id, 'ENDED')} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#f9fafb', color: '#6b7280' }}>End Now</button>
                      )}
                      {(computed === 'SCHEDULED' || computed === 'ACTIVE') && (
                        <button onClick={() => handleUpdateStatus(sale.id, 'CANCELLED')} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#fef2f2', color: '#dc2626' }}>Cancel</button>
                      )}
                      <button onClick={() => toggleExpand(sale.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                        <Tag className="w-3 h-3" /> Items {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t px-5 py-4 space-y-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-1)' }}>
                    {itemsLoading === sale.id ? (
                      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-3)' }}><Loader2 className="w-4 h-4 animate-spin" /> Loading items…</div>
                    ) : items.length === 0 ? (
                      <p className="text-sm" style={{ color: 'var(--text-3)' }}>No items added yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {items.map(item => (
                          <div key={item.id} className="rounded-lg px-4 py-3 flex items-center gap-4 flex-wrap" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-mono truncate" style={{ color: 'var(--text-3)' }}>Product: {item.productId}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>{formatCurrency(item.salePrice, currency)}</span>
                                <span className="text-xs line-through" style={{ color: 'var(--text-3)' }}>{formatCurrency(item.originalPrice, currency)}</span>
                                <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: '#fef3c7', color: '#d97706' }}>-{item.discountPct}%</span>
                              </div>
                            </div>
                            <div className="w-40"><StockBar stockLimit={item.stockLimit} soldQty={item.soldQty} /></div>
                            <span className={cn('text-xs px-2 py-0.5 rounded-full')} style={item.active ? { background: '#f0fdf4', color: '#16a34a' } : { background: '#f9fafb', color: '#6b7280' }}>
                              {item.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(computed === 'SCHEDULED' || computed === 'ACTIVE') && (
                      showItemForm === sale.id ? (
                        <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Add Item</p>
                            <button onClick={() => setShowItemForm(null)}><X className="w-4 h-4" style={{ color: 'var(--text-3)' }} /></button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {([
                              { key: 'productId', label: 'Product ID', placeholder: 'prod_xxx', type: 'text' },
                              { key: 'originalPrice', label: 'Original Price', placeholder: '100000', type: 'number' },
                              { key: 'salePrice', label: 'Sale Price', placeholder: '75000', type: 'number' },
                              { key: 'stockLimit', label: 'Stock Limit (0=∞)', placeholder: '50', type: 'number' },
                            ] as const).map(({ key, label, placeholder, type }) => (
                              <div key={key}>
                                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>{label}</label>
                                <input type={type} placeholder={placeholder}
                                  value={(itemForm[sale.id] as any)?.[key] ?? ''}
                                  onChange={e => setItemForm(m => ({ ...m, [sale.id]: { ...m[sale.id], [key]: e.target.value } }))}
                                  className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                                  style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }} />
                              </div>
                            ))}
                          </div>
                          {itemForm[sale.id]?.originalPrice && itemForm[sale.id]?.salePrice && (
                            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                              Discount: <strong>{calcDiscountPct(Number(itemForm[sale.id].originalPrice), Number(itemForm[sale.id].salePrice))}%</strong>
                            </p>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => setShowItemForm(null)} className="px-3 py-1.5 rounded-lg text-sm border" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>Cancel</button>
                            <button onClick={() => handleAddItem(sale.id)} disabled={addingItem === sale.id}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: 'var(--primary)', color: '#fff' }}>
                              {addingItem === sale.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Add Item
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setShowItemForm(sale.id)} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--primary)' }}>
                          <Plus className="w-4 h-4" /> Add item
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'new' && (
        <div className="rounded-xl p-6 space-y-5 max-w-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5" style={{ color: 'var(--primary)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>New Flash Sale</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Sale Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Harbolnas 11.11 Flash"
                className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Start *</label>
                <input type="datetime-local" value={form.startAt} onChange={e => setForm(f => ({ ...f, startAt: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                  style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>End *</label>
                <input type="datetime-local" value={form.endAt} onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm border outline-none"
                  style={{ background: 'var(--bg-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }} />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setActiveTab('sales')} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>Cancel</button>
            <button onClick={handleCreateSale} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: 'var(--primary)', color: '#fff' }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {saving ? 'Creating…' : 'Create Flash Sale'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
