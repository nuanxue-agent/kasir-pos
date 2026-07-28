'use client'

import { useState } from 'react'
import {
  ShoppingCart,
  Plus,
  X,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Package,
  TrendingUp,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcSalesVelocity,
  calcDaysOfStock,
  isReorderPointBreached,
  calcSuggestedQty,
  classifyUrgency,
  calcExpectedStockout,
} from '@/lib/replenishment'

// Re-export pure helpers so unit tests can import from this component
export {
  calcSalesVelocity,
  calcDaysOfStock,
  isReorderPointBreached,
  calcSuggestedQty,
  classifyUrgency,
  calcExpectedStockout,
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Urgency = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
type SuggestionStatus = 'PENDING' | 'ORDERED' | 'DISMISSED'

interface ReplenishmentConfig {
  id: string
  storeId: string
  productId: string
  productName: string
  sku: string | null
  minStock: number
  maxStock: number
  reorderPoint: number
  leadTimeDays: number
  safetyStock: number
  active: boolean
  currentStock: number
  vendorId: string | null
  vendorName: string | null
}

interface ReplenishmentSuggestion {
  id: string
  storeId: string
  productId: string
  productName: string
  sku: string | null
  vendorId: string | null
  vendorName: string | null
  suggestedQty: number
  urgency: Urgency
  currentStock: number
  expectedStockout: string | null
  createdAt: string
  status: SuggestionStatus
}

interface Product {
  id: string
  name: string
  sku: string | null
  stock: number
}

interface Vendor {
  id: string
  name: string
}

interface Props {
  storeId: string
  currency: string
  initialConfigs: ReplenishmentConfig[]
  initialSuggestions: ReplenishmentSuggestion[]
  products: Product[]
  vendors: Vendor[]
}

// ── Urgency helpers ────────────────────────────────────────────────────────────

const URGENCY_LABEL: Record<Urgency, string> = {
  CRITICAL: 'Kritis',
  HIGH: 'Tinggi',
  MEDIUM: 'Sedang',
  LOW: 'Rendah',
}

const URGENCY_COLOR: Record<Urgency, string> = {
  CRITICAL: 'text-red-500',
  HIGH: 'text-orange-500',
  MEDIUM: 'text-yellow-500',
  LOW: 'text-blue-500',
}

const URGENCY_BG: Record<Urgency, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-blue-100 text-blue-700',
}

// ── Sub-component: SuggestionCard ─────────────────────────────────────────────

function SuggestionCard({
  s,
  onOrder,
  onDismiss,
}: {
  s: ReplenishmentSuggestion
  onOrder: (id: string) => void
  onDismiss: (id: string) => void
}) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-[var(--text-1)] truncate">{s.productName}</p>
            {s.sku && <span className="text-xs text-[var(--text-3)]">SKU: {s.sku}</span>}
            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', URGENCY_BG[s.urgency])}>
              {URGENCY_LABEL[s.urgency]}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-[var(--text-3)]">
            <span className="flex items-center gap-1">
              <Package size={13} />
              Stok: <strong className={cn('ml-1', URGENCY_COLOR[s.urgency])}>{s.currentStock}</strong>
            </span>
            <span className="flex items-center gap-1">
              <ShoppingCart size={13} />
              Saran pesan: <strong className="ml-1 text-[var(--text-1)]">{s.suggestedQty}</strong>
            </span>
            {s.expectedStockout && (
              <span className="flex items-center gap-1">
                <Clock size={13} />
                Kehabisan: <strong className="ml-1 text-[var(--text-1)]">{s.expectedStockout}</strong>
              </span>
            )}
            {s.vendorName && (
              <span className="flex items-center gap-1">
                <TrendingUp size={13} />
                Vendor: {s.vendorName}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => onOrder(s.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-medium hover:opacity-90 transition"
          >
            <CheckCircle size={13} />
            Pesan
          </button>
          <button
            onClick={() => onDismiss(s.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-[var(--bg-2)] transition"
          >
            <XCircle size={13} />
            Abaikan
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReplenishmentClient({
  storeId,
  currency,
  initialConfigs,
  initialSuggestions,
  products,
  vendors,
}: Props) {
  const [configs, setConfigs] = useState<ReplenishmentConfig[]>(
    initialConfigs.map(c => ({ ...c, active: Boolean(c.active) }))
  )
  const [suggestions, setSuggestions] = useState<ReplenishmentSuggestion[]>(initialSuggestions)
  const [tab, setTab] = useState<'suggestions' | 'configs'>('suggestions')
  const [showForm, setShowForm] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    productId: '',
    vendorId: '',
    minStock: '',
    maxStock: '',
    reorderPoint: '',
    leadTimeDays: '7',
    safetyStock: '',
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/replenishment-suggestions/generate?storeId=${storeId}`, {
        method: 'POST',
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success(`${json.created} saran pengadaan dibuat`)
      // Refresh pending suggestions
      const sgRes = await fetch(`/api/replenishment-suggestions?storeId=${storeId}&status=PENDING`)
      const sgJson = await sgRes.json() as any[]
      setSuggestions(sgJson)
      setTab('suggestions')
    } finally {
      setGenerating(false)
    }
  }

  const handleCreateConfig = async () => {
    if (!form.productId || !form.reorderPoint || !form.minStock || !form.maxStock) {
      toast.error('Lengkapi semua field yang wajib diisi')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/replenishment-configs?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: form.productId,
          vendorId: form.vendorId || null,
          minStock: parseFloat(form.minStock),
          maxStock: parseFloat(form.maxStock),
          reorderPoint: parseFloat(form.reorderPoint),
          leadTimeDays: parseInt(form.leadTimeDays) || 7,
          safetyStock: parseFloat(form.safetyStock) || 0,
        }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Konfigurasi pengadaan disimpan')
      // Refresh configs
      const cfgRes = await fetch(`/api/replenishment-configs?storeId=${storeId}`)
      const cfgJson = await cfgRes.json() as any[]
      setConfigs(cfgJson.map((c: any) => ({ ...c, active: Boolean(c.active) })))
      setShowForm(false)
      setForm({ productId: '', vendorId: '', minStock: '', maxStock: '', reorderPoint: '', leadTimeDays: '7', safetyStock: '' })
    } finally {
      setLoading(false)
    }
  }

  const handleToggleConfig = async (cfg: ReplenishmentConfig) => {
    const res = await fetch(`/api/replenishment-configs/${cfg.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !cfg.active }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    setConfigs(prev => prev.map(c => c.id === cfg.id ? { ...c, active: !c.active } : c))
    toast.success(cfg.active ? 'Konfigurasi dinonaktifkan' : 'Konfigurasi diaktifkan')
  }

  const handleSuggestionAction = async (id: string, status: 'ORDERED' | 'DISMISSED') => {
    const res = await fetch(`/api/replenishment-suggestions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success(status === 'ORDERED' ? 'PO dibuat otomatis' : 'Saran diabaikan')
    setSuggestions(prev => prev.filter(s => s.id !== id))
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const configuredProductIds = new Set(configs.map(c => c.productId))
  const availableProducts = products.filter(p => !configuredProductIds.has(p.id))

  const criticalCount = suggestions.filter(s => s.urgency === 'CRITICAL').length
  const highCount = suggestions.filter(s => s.urgency === 'HIGH').length
  const activeConfigs = configs.filter(c => c.active).length

  const urgencyOrder: Urgency[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
  const sortedSuggestions = [...suggestions].sort(
    (a, b) => urgencyOrder.indexOf(a.urgency) - urgencyOrder.indexOf(b.urgency)
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Pengadaan Cerdas</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Saran pemesanan otomatis berdasarkan kecepatan penjualan 30 hari terakhir
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-60 transition"
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Generate Saran
          </button>
          {tab === 'configs' && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--bg-2)] transition"
            >
              <Plus size={16} />
              Tambah Konfigurasi
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Konfigurasi Aktif', value: activeConfigs, icon: Package, color: 'text-blue-500' },
          { label: 'Saran Pending', value: suggestions.length, icon: ShoppingCart, color: 'text-yellow-500' },
          { label: 'Status Kritis', value: criticalCount, icon: AlertTriangle, color: 'text-red-500' },
          { label: 'Perlu Segera', value: highCount, icon: TrendingUp, color: 'text-orange-500' },
        ].map(card => (
          <div key={card.label} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <card.icon size={16} className={card.color} />
              <span className="text-xs text-[var(--text-3)]">{card.label}</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-1)]">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {(['suggestions', 'configs'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition border-b-2 -mb-px',
              tab === t
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]'
            )}
          >
            {t === 'suggestions'
              ? `Saran Pengadaan (${suggestions.length})`
              : `Konfigurasi (${configs.length})`}
          </button>
        ))}
      </div>

      {/* ── Suggestions tab ── */}
      {tab === 'suggestions' && (
        <div className="space-y-3">
          {sortedSuggestions.length === 0 ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-12 text-center">
              <ShoppingCart size={40} className="mx-auto mb-3 text-[var(--text-3)]" />
              <p className="text-[var(--text-2)]">Tidak ada saran pengadaan aktif</p>
              <p className="text-sm text-[var(--text-3)] mt-1">
                Klik &ldquo;Generate Saran&rdquo; untuk memindai stok dan membuat saran baru
              </p>
            </div>
          ) : (
            sortedSuggestions.map(s => (
              <SuggestionCard
                key={s.id}
                s={s}
                onOrder={id => handleSuggestionAction(id, 'ORDERED')}
                onDismiss={id => handleSuggestionAction(id, 'DISMISSED')}
              />
            ))
          )}
        </div>
      )}

      {/* ── Configs tab ── */}
      {tab === 'configs' && (
        <div className="space-y-3">
          {configs.length === 0 ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-12 text-center">
              <Package size={40} className="mx-auto mb-3 text-[var(--text-3)]" />
              <p className="text-[var(--text-2)]">Belum ada konfigurasi pengadaan</p>
              <p className="text-sm text-[var(--text-3)] mt-1">
                Tambahkan konfigurasi untuk mulai memantau stok secara cerdas
              </p>
            </div>
          ) : (
            configs.map(cfg => (
              <div
                key={cfg.id}
                className={cn(
                  'bg-[var(--bg-card)] border rounded-xl transition',
                  cfg.active ? 'border-[var(--border)]' : 'border-[var(--border)] opacity-60'
                )}
              >
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() => setExpandedConfig(expandedConfig === cfg.id ? null : cfg.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Package size={18} className="text-[var(--text-3)] shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text-1)] truncate">{cfg.productName}</p>
                      {cfg.sku && <p className="text-xs text-[var(--text-3)]">SKU: {cfg.sku}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={cn('text-sm font-medium', cfg.currentStock <= cfg.reorderPoint ? 'text-red-500' : 'text-emerald-500')}>
                      Stok: {cfg.currentStock}
                    </span>
                    <span className="text-xs text-[var(--text-3)]">ROP: {cfg.reorderPoint}</span>
                    {expandedConfig === cfg.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {expandedConfig === cfg.id && (
                  <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-[var(--text-3)]">Min Stok</p>
                        <p className="font-medium text-[var(--text-1)]">{cfg.minStock}</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)]">Max Stok</p>
                        <p className="font-medium text-[var(--text-1)]">{cfg.maxStock}</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)]">Safety Stock</p>
                        <p className="font-medium text-[var(--text-1)]">{cfg.safetyStock}</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)]">Lead Time</p>
                        <p className="font-medium text-[var(--text-1)]">{cfg.leadTimeDays} hari</p>
                      </div>
                    </div>
                    {cfg.vendorName && (
                      <p className="text-sm text-[var(--text-3)]">Vendor: <span className="text-[var(--text-1)]">{cfg.vendorName}</span></p>
                    )}
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleToggleConfig(cfg)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm font-medium transition',
                          cfg.active
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        )}
                      >
                        {cfg.active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Add Config Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[var(--bg-1)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold text-[var(--text-1)]">Tambah Konfigurasi Pengadaan</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:opacity-70 transition">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Produk *</label>
                <select
                  value={form.productId}
                  onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-1)] text-sm"
                >
                  <option value="">Pilih produk…</option>
                  {availableProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Vendor</label>
                <select
                  value={form.vendorId}
                  onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-1)] text-sm"
                >
                  <option value="">Pilih vendor…</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Min Stok *</label>
                  <input
                    type="number" min="0"
                    value={form.minStock}
                    onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))}
                    placeholder="mis. 5"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-1)] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Max Stok *</label>
                  <input
                    type="number" min="0"
                    value={form.maxStock}
                    onChange={e => setForm(f => ({ ...f, maxStock: e.target.value }))}
                    placeholder="mis. 100"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-1)] text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Titik Reorder *</label>
                  <input
                    type="number" min="0"
                    value={form.reorderPoint}
                    onChange={e => setForm(f => ({ ...f, reorderPoint: e.target.value }))}
                    placeholder="mis. 15"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-1)] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Safety Stock</label>
                  <input
                    type="number" min="0"
                    value={form.safetyStock}
                    onChange={e => setForm(f => ({ ...f, safetyStock: e.target.value }))}
                    placeholder="mis. 10"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-1)] text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Lead Time (hari)</label>
                <input
                  type="number" min="0"
                  value={form.leadTimeDays}
                  onChange={e => setForm(f => ({ ...f, leadTimeDays: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-1)] text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border)]">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--bg-2)] transition"
              >
                Batal
              </button>
              <button
                onClick={handleCreateConfig}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-60 transition"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
