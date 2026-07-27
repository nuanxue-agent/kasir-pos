'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Truck, Phone, Mail, MapPin, Edit2, Trash2, X, Star, TrendingUp, ShoppingCart, Package, ExternalLink } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

interface SuppliersPageClientProps {
  storeId: string
  currency?: string
}

const inputCls = 'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

// ── Rating helpers ────────────────────────────────────────────────────────────

function extractRating(notes: string | null | undefined): number {
  if (!notes) return 0
  const m = notes.match(/\[rating:([1-5])\]/)
  return m ? Number(m[1]) : 0
}

function setRatingInNotes(notes: string, rating: number): string {
  const stripped = notes.replace(/\[rating:[1-5]\]\s*/g, '').trim()
  return rating > 0 ? `[rating:${rating}] ${stripped}`.trim() : stripped
}

function StarRating({ value, onChange, readonly }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n === value ? 0 : n)}
          className={cn('transition-colors', readonly ? 'cursor-default' : 'hover:scale-110')}
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
        >
          <Star className={cn('h-4 w-4', n <= value ? 'fill-amber-400 text-amber-400' : 'text-stone-300')} />
        </button>
      ))}
    </div>
  )
}

// ── Supplier form ─────────────────────────────────────────────────────────────

function SupplierForm({ storeId, supplier, onClose, onSaved }: {
  storeId: string
  supplier?: any
  onClose: () => void
  onSaved: () => void
}) {
  const currentRating = extractRating(supplier?.notes)
  const notesWithoutRating = supplier?.notes?.replace(/\[rating:[1-5]\]\s*/g, '').trim() ?? ''

  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    taxId: supplier?.taxId ?? '',
    notes: notesWithoutRating,
  })
  const [rating, setRating] = useState(currentRating)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit() {
    setError('')
    if (!form.name.trim() || form.name.trim().length < 2) return setError('Nama minimal 2 karakter')
    setSaving(true)
    const notesWithRating = setRatingInNotes(form.notes, rating)
    const url = supplier
      ? `/api/suppliers/${supplier.id}?storeId=${storeId}`
      : `/api/suppliers?storeId=${storeId}`
    const res = await fetch(url, {
      method: supplier ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, notes: notesWithRating }),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else {
      const d = await res.json() as any
      setError(d.error ?? 'Gagal menyimpan')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] w-full sm:max-w-lg sm:rounded-xl rounded-t-3xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-bold text-[var(--text-1)]">{supplier ? 'Edit Supplier' : 'Tambah Supplier'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)] transition-colors">
            <X className="h-4 w-4 text-[var(--text-2)]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          )}
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Nama Supplier *</label>
            <input value={form.name} onChange={set('name')} className={inputCls} placeholder="PT Sumber Makmur" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Telepon</label>
              <input value={form.phone} onChange={set('phone')} className={inputCls} placeholder="021-12345678" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Email</label>
              <input value={form.email} onChange={set('email')} type="email" className={inputCls} placeholder="info@supplier.com" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">NPWP / Tax ID</label>
            <input value={form.taxId} onChange={set('taxId')} className={inputCls} placeholder="01.234.567.8-901.000" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Alamat</label>
            <textarea value={form.address} onChange={set('address')} rows={2} className={inputCls} placeholder="Jl. Industri No. 1, Jakarta" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Rating Supplier</label>
            <div className="flex items-center gap-3">
              <StarRating value={rating} onChange={setRating} />
              {rating > 0 && (
                <span className="text-xs text-[var(--text-3)]">{rating} bintang</span>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-2)] mb-1.5 block">Catatan</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} className={inputCls} placeholder="Catatan internal…" />
          </div>
        </div>
        <div className="border-t border-[var(--border)] p-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[var(--bg-muted)] text-[var(--text-2)] text-sm font-semibold hover:bg-stone-200 transition-colors">Batal</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-md shadow-amber-200 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Supplier detail modal ─────────────────────────────────────────────────────

function SupplierDetailModal({ supplier, storeId, currency, onClose, onEdit }: {
  supplier: any
  storeId: string
  currency: string
  onClose: () => void
  onEdit: () => void
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'history' | 'metrics'>('info')

  const { data: posRaw } = useQuery({
    queryKey: ['purchase-orders', storeId, '', supplier.id],
    queryFn: () =>
      fetch(`/api/purchase-orders?storeId=${storeId}&supplierId=${supplier.id}&limit=50`)
        .then(r => r.json()),
    enabled: activeTab === 'history' || activeTab === 'metrics',
  })

  const orders: any[] = (posRaw as any)?.orders ?? []

  // Performance metrics
  const totalOrders = orders.length
  const totalValue = orders.reduce((s: number, o: any) => s + (o.total ?? 0), 0)
  const receivedOrders = orders.filter((o: any) => o.status === 'RECEIVED')
  const avgDeliveryDays = (() => {
    const withDays = receivedOrders.filter((o: any) => o.orderDate && o.updatedAt)
    if (withDays.length === 0) return null
    const avg = withDays.reduce((s: number, o: any) => {
      const diff = (new Date(o.updatedAt).getTime() - new Date(o.orderDate).getTime()) / (1000 * 60 * 60 * 24)
      return s + diff
    }, 0) / withDays.length
    return Math.round(avg)
  })()

  const rating = extractRating(supplier.notes)
  const cleanNotes = supplier.notes?.replace(/\[rating:[1-5]\]\s*/g, '').trim() ?? ''

  const phoneForWhatsApp = supplier.phone?.replace(/\D/g, '').replace(/^0/, '62')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] w-full sm:max-w-xl sm:rounded-xl rounded-t-3xl shadow-xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <Truck className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[var(--text-1)] truncate">{supplier.name}</p>
              {rating > 0 && <StarRating value={rating} readonly />}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)] transition-colors">
              <Edit2 className="h-4 w-4 text-[var(--text-3)]" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)] transition-colors">
              <X className="h-4 w-4 text-[var(--text-2)]" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] px-5">
          {([['info', 'Info'], ['history', 'Riwayat PO'], ['metrics', 'Performa']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setActiveTab(val)}
              className={cn('px-4 py-3 text-sm font-semibold border-b-2 transition-colors',
                activeTab === val ? 'border-amber-500 text-amber-600' : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]'
              )}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Info tab */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              {/* Contact buttons */}
              {(supplier.email || supplier.phone) && (
                <div className="flex gap-2 flex-wrap">
                  {supplier.email && (
                    <a href={`mailto:${supplier.email}`}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 text-xs font-semibold rounded-xl hover:bg-blue-100 transition-colors">
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </a>
                  )}
                  {supplier.phone && (
                    <a href={`tel:${supplier.phone}`}
                      className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-subtle)] text-[var(--text-2)] text-xs font-semibold rounded-xl hover:bg-[var(--bg-muted)] transition-colors border border-[var(--border)]">
                      <Phone className="h-3.5 w-3.5" />
                      Telepon
                    </a>
                  )}
                  {phoneForWhatsApp && (
                    <a href={`https://wa.me/${phoneForWhatsApp}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 text-xs font-semibold rounded-xl hover:bg-emerald-100 transition-colors">
                      <ExternalLink className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  )}
                </div>
              )}

              {/* Contact details */}
              <div className="space-y-2">
                {supplier.phone && (
                  <div className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                    <Phone className="h-4 w-4 text-stone-300 shrink-0" /> {supplier.phone}
                  </div>
                )}
                {supplier.email && (
                  <div className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                    <Mail className="h-4 w-4 text-stone-300 shrink-0" /> {supplier.email}
                  </div>
                )}
                {supplier.address && (
                  <div className="flex items-start gap-2 text-sm text-[var(--text-2)]">
                    <MapPin className="h-4 w-4 text-stone-300 shrink-0 mt-0.5" />
                    <span>{supplier.address}</span>
                  </div>
                )}
                {supplier.taxId && (
                  <p className="text-xs text-[var(--text-3)]">NPWP: {supplier.taxId}</p>
                )}
              </div>

              {cleanNotes && (
                <div className="bg-[var(--bg-subtle)] rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-[var(--text-2)] mb-1">Catatan</p>
                  <p className="text-sm text-[var(--text-2)]">{cleanNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* History tab */}
          {activeTab === 'history' && (
            <div className="space-y-2">
              {orders.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-[var(--text-3)]">
                  <Package className="h-10 w-10 text-stone-200 mb-2" />
                  <p className="text-sm">Belum ada purchase order</p>
                </div>
              ) : orders.map((o: any) => (
                <div key={o.id} className="flex items-center justify-between bg-[var(--bg-subtle)] rounded-xl px-4 py-3">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[var(--text-1)]">{o.number}</p>
                    <p className="text-xs text-[var(--text-3)]">{o.orderDate ? new Date(o.orderDate).toLocaleDateString('id-ID') : '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[var(--text-1)]">{formatCurrency(o.total, currency)}</p>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-lg',
                      o.status === 'RECEIVED' ? 'bg-emerald-50 text-emerald-600' :
                      o.status === 'CANCELLED' ? 'bg-red-50 text-red-500' :
                      'bg-amber-50 text-amber-600'
                    )}>{o.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Metrics tab */}
          {activeTab === 'metrics' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--bg-subtle)] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingCart className="h-4 w-4 text-amber-500" />
                    <p className="text-xs font-semibold text-[var(--text-2)]">Total PO</p>
                  </div>
                  <p className="text-2xl font-bold text-[var(--text-1)]">{totalOrders}</p>
                  <p className="text-xs text-[var(--text-3)] mt-0.5">{receivedOrders.length} diterima</p>
                </div>
                <div className="bg-[var(--bg-subtle)] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <p className="text-xs font-semibold text-[var(--text-2)]">Total Nilai</p>
                  </div>
                  <p className="text-lg font-bold text-[var(--text-1)] leading-tight">{formatCurrency(totalValue, currency)}</p>
                </div>
              </div>
              <div className="bg-[var(--bg-subtle)] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Truck className="h-4 w-4 text-blue-500" />
                  <p className="text-xs font-semibold text-[var(--text-2)]">Rata-rata Hari Pengiriman</p>
                </div>
                <p className="text-2xl font-bold text-[var(--text-1)]">
                  {avgDeliveryDays !== null ? `${avgDeliveryDays} hari` : '—'}
                </p>
                <p className="text-xs text-[var(--text-3)] mt-0.5">Berdasarkan {receivedOrders.length} PO yang sudah diterima</p>
              </div>
              {rating > 0 && (
                <div className="bg-[var(--bg-subtle)] rounded-xl p-4">
                  <p className="text-xs font-semibold text-[var(--text-2)] mb-2">Rating Supplier</p>
                  <div className="flex items-center gap-3">
                    <StarRating value={rating} readonly />
                    <span className="text-sm font-semibold text-[var(--text-1)]">{rating}/5</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SuppliersPageClient({ storeId, currency = 'IDR' }: SuppliersPageClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [viewing, setViewing] = useState<any>(null)

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers', storeId],
    queryFn: () => fetch(`/api/suppliers?storeId=${storeId}`).then(r => r.json()),
  })

  const filtered = (suppliers as any[]).filter((s: any) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search)
  )

  async function deleteSupplier(id: string) {
    if (!confirm('Nonaktifkan supplier ini?')) return
    await fetch(`/api/suppliers/${id}?storeId=${storeId}`, { method: 'DELETE' })
    qc.invalidateQueries({ queryKey: ['suppliers'] })
  }

  const refresh = () => {
    setShowForm(false)
    setEditing(null)
    qc.invalidateQueries({ queryKey: ['suppliers'] })
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Supplier</h1>
          <p className="text-[var(--text-3)] text-sm mt-0.5">Kelola daftar pemasok</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-amber-200 hover:opacity-90 transition-all">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Tambah Supplier</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-3)]" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 shadow-sm"
          placeholder="Cari nama, email, atau telepon…" />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-[var(--bg-subtle)] animate-pulse rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm">
          <Truck className="h-12 w-12 text-stone-200 mb-3" />
          <p className="text-[var(--text-3)] text-sm">{search ? 'Tidak ada supplier yang cocok' : 'Belum ada supplier'}</p>
          {!search && (
            <button onClick={() => setShowForm(true)} className="mt-3 text-amber-500 text-sm font-medium hover:text-amber-600">
              + Tambah supplier pertama
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((s: any) => {
            const rating = extractRating(s.notes)
            const phoneForWA = s.phone?.replace(/\D/g, '').replace(/^0/, '62')
            return (
              <div key={s.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm hover:border-[var(--border)] transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <button className="flex items-center gap-3 min-w-0 text-left flex-1" onClick={() => setViewing(s)}>
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <Truck className="h-5 w-5 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text-1)] truncate">{s.name}</p>
                      {s.taxId && <p className="text-xs text-[var(--text-3)] truncate">NPWP: {s.taxId}</p>}
                      {rating > 0 && <StarRating value={rating} readonly />}
                    </div>
                  </button>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditing(s); setViewing(null) }} className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)] transition-colors">
                      <Edit2 className="h-3.5 w-3.5 text-[var(--text-3)]" />
                    </button>
                    <button onClick={() => deleteSupplier(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                      <Trash2 className="h-3.5 w-3.5 text-[var(--text-3)] hover:text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {s.phone && (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-2)]">
                      <Phone className="h-3 w-3 text-stone-300" />
                      <span>{s.phone}</span>
                      {phoneForWA && (
                        <a href={`https://wa.me/${phoneForWA}`} target="_blank" rel="noopener noreferrer"
                          className="ml-1 text-emerald-500 hover:text-emerald-600 font-medium"
                          onClick={e => e.stopPropagation()}>
                          WA
                        </a>
                      )}
                    </div>
                  )}
                  {s.email && (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-2)]">
                      <Mail className="h-3 w-3 text-stone-300" />
                      <a href={`mailto:${s.email}`} className="hover:text-blue-500 transition-colors truncate"
                        onClick={e => e.stopPropagation()}>
                        {s.email}
                      </a>
                    </div>
                  )}
                  {s.address && (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-2)]">
                      <MapPin className="h-3 w-3 text-stone-300" /> <span className="truncate">{s.address}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(showForm || editing) && (
        <SupplierForm storeId={storeId} supplier={editing} onClose={() => { setShowForm(false); setEditing(null) }} onSaved={refresh} />
      )}

      {viewing && !editing && (
        <SupplierDetailModal
          supplier={viewing}
          storeId={storeId}
          currency={currency}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null) }}
        />
      )}
    </div>
  )
}
