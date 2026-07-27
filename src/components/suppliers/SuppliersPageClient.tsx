'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Truck, Phone, Mail, MapPin, Edit2, Trash2, X, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SuppliersPageClientProps {
  storeId: string
}

const inputCls = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

function SupplierForm({ storeId, supplier, onClose, onSaved }: {
  storeId: string
  supplier?: any
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    taxId: supplier?.taxId ?? '',
    notes: supplier?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit() {
    setError('')
    if (!form.name.trim() || form.name.trim().length < 2) return setError('Nama minimal 2 karakter')
    setSaving(true)
    const url = supplier
      ? `/api/suppliers/${supplier.id}?storeId=${storeId}`
      : `/api/suppliers?storeId=${storeId}`
    const res = await fetch(url, {
      method: supplier ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else {
      const d = await res.json()
      setError(d.error ?? 'Gagal menyimpan')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="text-base font-bold text-stone-800">{supplier ? 'Edit Supplier' : 'Tambah Supplier'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors">
            <X className="h-4 w-4 text-stone-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          )}
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Nama Supplier *</label>
            <input value={form.name} onChange={set('name')} className={inputCls} placeholder="PT Sumber Makmur" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Telepon</label>
              <input value={form.phone} onChange={set('phone')} className={inputCls} placeholder="021-12345678" />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Email</label>
              <input value={form.email} onChange={set('email')} type="email" className={inputCls} placeholder="info@supplier.com" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">NPWP / Tax ID</label>
            <input value={form.taxId} onChange={set('taxId')} className={inputCls} placeholder="01.234.567.8-901.000" />
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Alamat</label>
            <textarea value={form.address} onChange={set('address')} rows={2} className={inputCls} placeholder="Jl. Industri No. 1, Jakarta" />
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Catatan</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} className={inputCls} placeholder="Catatan internal…" />
          </div>
        </div>
        <div className="border-t border-stone-100 p-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-stone-100 text-stone-600 text-sm font-semibold hover:bg-stone-200 transition-colors">Batal</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-md shadow-amber-200 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SuppliersPageClient({ storeId }: SuppliersPageClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)

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
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Supplier</h1>
          <p className="text-stone-400 text-sm mt-0.5">Kelola daftar pemasok</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-amber-200 hover:opacity-90 transition-all">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Tambah Supplier</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-stone-100 rounded-2xl text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 shadow-sm"
          placeholder="Cari nama, email, atau telepon…" />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-stone-50 animate-pulse rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-stone-100 shadow-sm">
          <Truck className="h-12 w-12 text-stone-200 mb-3" />
          <p className="text-stone-400 text-sm">{search ? 'Tidak ada supplier yang cocok' : 'Belum ada supplier'}</p>
          {!search && (
            <button onClick={() => setShowForm(true)} className="mt-3 text-amber-500 text-sm font-medium hover:text-amber-600">
              + Tambah supplier pertama
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((s: any) => (
            <div key={s.id} className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <Truck className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-800 truncate">{s.name}</p>
                    {s.taxId && <p className="text-xs text-stone-400 truncate">NPWP: {s.taxId}</p>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setEditing(s)} className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors">
                    <Edit2 className="h-3.5 w-3.5 text-stone-400" />
                  </button>
                  <button onClick={() => deleteSupplier(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 className="h-3.5 w-3.5 text-stone-400 hover:text-red-500" />
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                {s.phone && (
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <Phone className="h-3 w-3 text-stone-300" /> {s.phone}
                  </div>
                )}
                {s.email && (
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <Mail className="h-3 w-3 text-stone-300" /> {s.email}
                  </div>
                )}
                {s.address && (
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <MapPin className="h-3 w-3 text-stone-300" /> <span className="truncate">{s.address}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(showForm || editing) && (
        <SupplierForm storeId={storeId} supplier={editing} onClose={() => { setShowForm(false); setEditing(null) }} onSaved={refresh} />
      )}
    </div>
  )
}
