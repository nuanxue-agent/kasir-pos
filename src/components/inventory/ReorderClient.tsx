'use client'

import { useState } from 'react'
import {
  ShoppingCart,
  Plus,
  X,
  RefreshCw,
  CheckCircle,
  XCircle,
  Package,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ──────────────────────────────────────────────────────────────────────

type SuggestionStatus = 'PENDING' | 'APPROVED' | 'ORDERED' | 'DISMISSED'

interface ReorderRule {
  id: string
  storeId: string
  productId: string
  productName: string
  sku: string | null
  currentStock: number
  reorderPoint: number
  reorderQty: number
  leadTimeDays: number
  preferredVendorId: string | null
  vendorName: string | null
  active: boolean
}

interface ReorderSuggestion {
  id: string
  storeId: string
  productId: string
  productName: string
  sku: string | null
  unit: string | null
  currentStock: number
  reorderPoint: number
  suggestedQty: number
  status: SuggestionStatus
  leadTimeDays: number
  preferredVendorId: string | null
  vendorName: string | null
  createdAt: string
}

interface Product {
  id: string
  name: string
  sku: string | null
  stock: number
  unit: string | null
}

interface Vendor {
  id: string
  name: string
}

interface ReorderClientProps {
  storeId: string
  currency: string
  initialRules: ReorderRule[]
  initialSuggestions: ReorderSuggestion[]
  products: Product[]
  vendors: Vendor[]
}

// ── Pure helpers (also exported for unit tests) ───────────────────────────────

export function stockStatusLabel(currentStock: number, reorderPoint: number): string {
  if (currentStock <= 0) return 'Habis'
  if (currentStock <= reorderPoint) return 'Kritis'
  if (currentStock <= reorderPoint * 1.5) return 'Rendah'
  return 'Aman'
}

export function stockStatusColor(currentStock: number, reorderPoint: number): string {
  if (currentStock <= 0) return 'text-red-500'
  if (currentStock <= reorderPoint) return 'text-orange-500'
  if (currentStock <= reorderPoint * 1.5) return 'text-yellow-500'
  return 'text-emerald-500'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReorderClient({
  storeId,
  currency,
  initialRules,
  initialSuggestions,
  products,
  vendors,
}: ReorderClientProps) {
  const [rules, setRules] = useState<ReorderRule[]>(
    initialRules.map(r => ({ ...r, active: Boolean(r.active) }))
  )
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>(initialSuggestions)
  const [tab, setTab] = useState<'rules' | 'suggestions'>('suggestions')
  const [showForm, setShowForm] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expandedRule, setExpandedRule] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    productId: '',
    reorderPoint: '',
    reorderQty: '',
    leadTimeDays: '0',
    preferredVendorId: '',
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGenerateSuggestions = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/reorder-suggestions/generate?storeId=${storeId}`, {
        method: 'POST',
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success(`${json.created} saran reorder dibuat`)
      // Refresh suggestions
      const sgRes = await fetch(`/api/reorder-suggestions?storeId=${storeId}&status=PENDING`)
      const sgJson = await sgRes.json() as any[]
      setSuggestions(sgJson)
      setTab('suggestions')
    } finally {
      setGenerating(false)
    }
  }

  const handleCreateRule = async () => {
    if (!form.productId || !form.reorderPoint || !form.reorderQty) {
      toast.error('Lengkapi semua field yang wajib diisi')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/reorder-rules?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: form.productId,
          reorderPoint: parseFloat(form.reorderPoint),
          reorderQty: parseFloat(form.reorderQty),
          leadTimeDays: parseInt(form.leadTimeDays) || 0,
          preferredVendorId: form.preferredVendorId || null,
        }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Aturan reorder disimpan')
      // Refresh rules
      const rulesRes = await fetch(`/api/reorder-rules?storeId=${storeId}`)
      const rulesJson = await rulesRes.json() as any[]
      setRules(rulesJson.map(r => ({ ...r, active: Boolean(r.active) })))
      setShowForm(false)
      setForm({ productId: '', reorderPoint: '', reorderQty: '', leadTimeDays: '0', preferredVendorId: '' })
    } finally {
      setLoading(false)
    }
  }

  const handleToggleRule = async (rule: ReorderRule) => {
    const res = await fetch(`/api/reorder-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !rule.active }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: !r.active } : r))
    toast.success(rule.active ? 'Aturan dinonaktifkan' : 'Aturan diaktifkan')
  }

  const handleSuggestionAction = async (suggestion: ReorderSuggestion, action: SuggestionStatus) => {
    const res = await fetch(`/api/reorder-suggestions/${suggestion.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: action }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }

    if (action === 'ORDERED') {
      toast.success('PO dibuat otomatis')
    } else if (action === 'APPROVED') {
      toast.success('Saran disetujui')
    } else if (action === 'DISMISSED') {
      toast.success('Saran diabaikan')
    }

    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id))
  }

  // ── Products not yet having a rule
  const productsWithoutRule = products.filter(
    p => !rules.some(r => r.productId === p.id)
  )

  const pendingSuggestions = suggestions.filter(s => s.status === 'PENDING')
  const approvedSuggestions = suggestions.filter(s => s.status === 'APPROVED')

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Reorder Point</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Pantau stok kritis dan buat pesanan pembelian otomatis
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGenerateSuggestions}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-60 transition"
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Pindai Stok
          </button>
          {tab === 'rules' && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--bg-2)] transition"
            >
              <Plus size={16} />
              Tambah Aturan
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Aturan Aktif', value: rules.filter(r => r.active).length, icon: Package, color: 'text-blue-500' },
          { label: 'Stok Kritis', value: rules.filter(r => r.currentStock <= r.reorderPoint).length, icon: AlertTriangle, color: 'text-orange-500' },
          { label: 'Saran Pending', value: pendingSuggestions.length, icon: ShoppingCart, color: 'text-yellow-500' },
          { label: 'Siap Dipesan', value: approvedSuggestions.length, icon: CheckCircle, color: 'text-emerald-500' },
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
        {(['suggestions', 'rules'] as const).map(t => (
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
            {t === 'suggestions' ? `Saran Reorder (${suggestions.length})` : `Aturan (${rules.length})`}
          </button>
        ))}
      </div>

      {/* ── Suggestions tab ── */}
      {tab === 'suggestions' && (
        <div className="space-y-4">
          {suggestions.length === 0 ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-12 text-center">
              <ShoppingCart size={40} className="mx-auto mb-3 text-[var(--text-3)]" />
              <p className="text-[var(--text-2)]">Tidak ada saran reorder aktif</p>
              <p className="text-sm text-[var(--text-3)] mt-1">Klik "Pindai Stok" untuk menghasilkan saran baru</p>
            </div>
          ) : (
            <>
              {pendingSuggestions.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-3)] mb-2 uppercase tracking-wide">Menunggu Persetujuan</h3>
                  <div className="space-y-2">
                    {pendingSuggestions.map(s => (
                      <SuggestionCard
                        key={s.id}
                        suggestion={s}
                        currency={currency}
                        onAction={handleSuggestionAction}
                      />
                    ))}
                  </div>
                </div>
              )}
              {approvedSuggestions.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-3)] mb-2 uppercase tracking-wide">Disetujui — Siap Dipesan</h3>
                  <div className="space-y-2">
                    {approvedSuggestions.map(s => (
                      <SuggestionCard
                        key={s.id}
                        suggestion={s}
                        currency={currency}
                        onAction={handleSuggestionAction}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Rules tab ── */}
      {tab === 'rules' && (
        <div className="space-y-3">
          {rules.length === 0 ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-12 text-center">
              <Package size={40} className="mx-auto mb-3 text-[var(--text-3)]" />
              <p className="text-[var(--text-2)]">Belum ada aturan reorder</p>
              <p className="text-sm text-[var(--text-3)] mt-1">Tambahkan aturan untuk mulai memantau stok</p>
            </div>
          ) : (
            rules.map(rule => (
              <div
                key={rule.id}
                className={cn(
                  'bg-[var(--bg-card)] border rounded-xl transition',
                  rule.active ? 'border-[var(--border)]' : 'border-[var(--border)] opacity-60'
                )}
              >
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Package size={18} className="text-[var(--text-3)] shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text-1)] truncate">{rule.productName}</p>
                      {rule.sku && <p className="text-xs text-[var(--text-3)]">SKU: {rule.sku}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={cn('text-sm font-medium', stockStatusColor(rule.currentStock, rule.reorderPoint))}>
                      {stockStatusLabel(rule.currentStock, rule.reorderPoint)}
                    </span>
                    <span className="text-sm text-[var(--text-3)]">
                      {rule.currentStock} / min {rule.reorderPoint}
                    </span>
                    {expandedRule === rule.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {expandedRule === rule.id && (
                  <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-[var(--text-3)]">Titik Reorder</p>
                        <p className="font-medium text-[var(--text-1)]">{rule.reorderPoint}</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)]">Qty Pesan</p>
                        <p className="font-medium text-[var(--text-1)]">{rule.reorderQty}</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)]">Lead Time</p>
                        <p className="font-medium text-[var(--text-1)]">{rule.leadTimeDays} hari</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)]">Vendor</p>
                        <p className="font-medium text-[var(--text-1)]">{rule.vendorName ?? '—'}</p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleToggleRule(rule)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm font-medium transition',
                          rule.active
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        )}
                      >
                        {rule.active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Add Rule Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[var(--bg-1)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold text-[var(--text-1)]">Tambah Aturan Reorder</h2>
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
                  {productsWithoutRule.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Titik Reorder *</label>
                  <input
                    type="number"
                    min="0"
                    value={form.reorderPoint}
                    onChange={e => setForm(f => ({ ...f, reorderPoint: e.target.value }))}
                    placeholder="mis. 10"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-1)] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Qty Pesan *</label>
                  <input
                    type="number"
                    min="1"
                    value={form.reorderQty}
                    onChange={e => setForm(f => ({ ...f, reorderQty: e.target.value }))}
                    placeholder="mis. 50"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-1)] text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Lead Time (hari)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.leadTimeDays}
                    onChange={e => setForm(f => ({ ...f, leadTimeDays: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-1)] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Vendor Pilihan</label>
                  <select
                    value={form.preferredVendorId}
                    onChange={e => setForm(f => ({ ...f, preferredVendorId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-1)] text-sm"
                  >
                    <option value="">Pilih vendor…</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
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
                onClick={handleCreateRule}
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

// ── Suggestion card sub-component ─────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  currency,
  onAction,
}: {
  suggestion: ReorderSuggestion
  currency: string
  onAction: (s: ReorderSuggestion, action: SuggestionStatus) => void
}) {
  const isPending = suggestion.status === 'PENDING'
  const isApproved = suggestion.status === 'APPROVED'

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-1 min-w-0">
        <p className="font-medium text-[var(--text-1)]">{suggestion.productName}</p>
        <div className="flex flex-wrap gap-3 text-xs text-[var(--text-3)]">
          <span>Stok: <strong className="text-orange-500">{suggestion.currentStock}</strong></span>
          <span>Min: {suggestion.reorderPoint}</span>
          <span>Pesan: <strong className="text-[var(--text-1)]">{suggestion.suggestedQty}</strong>{suggestion.unit ? ` ${suggestion.unit}` : ''}</span>
          {suggestion.vendorName && <span>Vendor: {suggestion.vendorName}</span>}
          {suggestion.leadTimeDays > 0 && <span>Lead: {suggestion.leadTimeDays}h</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isPending && (
          <>
            <button
              onClick={() => onAction(suggestion, 'APPROVED')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-sm font-medium transition"
            >
              <CheckCircle size={14} />
              Setuju
            </button>
            <button
              onClick={() => onAction(suggestion, 'DISMISSED')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium transition"
            >
              <XCircle size={14} />
              Abaikan
            </button>
          </>
        )}
        {isApproved && (
          <>
            <button
              onClick={() => onAction(suggestion, 'ORDERED')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white hover:opacity-90 text-sm font-medium transition"
            >
              <ShoppingCart size={14} />
              Buat PO
            </button>
            <button
              onClick={() => onAction(suggestion, 'DISMISSED')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-3)] hover:bg-[var(--bg-2)] text-sm transition"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
