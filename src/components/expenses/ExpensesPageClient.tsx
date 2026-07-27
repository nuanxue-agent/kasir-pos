'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, TrendingDown, X, Check, ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

const CATEGORIES = ['Bahan Baku', 'Operasional', 'Gaji', 'Sewa', 'Utilitas', 'Pemasaran', 'Peralatan', 'Lain-lain']

interface Expense {
  id: string
  category: string
  description: string
  amount: number
  date: string
  note?: string | null
}

interface Props { storeId: string; currency: string }

const inputCls = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

function todayStr() { return new Date().toISOString().slice(0, 10) }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

export default function ExpensesPageClient({ storeId, currency }: Props) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Expense | null>(null)
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayStr())
  const [form, setForm] = useState({ category: 'Operasional', description: '', amount: '', date: todayStr(), note: '' })
  const [saving, setSaving] = useState(false)

  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ['expenses', storeId, from, to],
    queryFn: () => fetch(`/api/expenses?storeId=${storeId}&from=${from}&to=${to}`).then(r => r.json()),
  })

  const total = (expenses as Expense[]).reduce((s, e) => s + e.amount, 0)
  const byCategory = (expenses as Expense[]).reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount
    return acc
  }, {} as Record<string, number>)

  const deleteMut = useMutation({
    mutationFn: (id: string) => fetch(`/api/expenses/${id}?storeId=${storeId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  })

  function resetForm() {
    setForm({ category: 'Operasional', description: '', amount: '', date: todayStr(), note: '' })
    setEditItem(null)
    setShowForm(false)
  }

  async function handleSave() {
    if (!form.description || !form.amount || !form.date) return
    setSaving(true)
    try {
      if (editItem) {
        await fetch(`/api/expenses/${editItem.id}?storeId=${storeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, amount: Number(form.amount) }),
        })
      } else {
        await fetch(`/api/expenses?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, amount: Number(form.amount) }),
        })
      }
      qc.invalidateQueries({ queryKey: ['expenses'] })
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  function openEdit(e: Expense) {
    setForm({ category: e.category, description: e.description, amount: String(e.amount), date: e.date, note: e.note ?? '' })
    setEditItem(e)
    setShowForm(true)
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Pengeluaran</h1>
          <p className="text-stone-400 text-sm mt-0.5">Catat biaya operasional tokomu</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="shrink-0 flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-md shadow-amber-200 hover:shadow-amber-300 transition-all active:scale-95"
        >
          <Plus className="h-4 w-4" /> Tambah
        </button>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3 py-2">
          <span className="text-xs text-stone-400">Dari</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="text-sm text-stone-700 bg-transparent focus:outline-none" />
        </div>
        <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3 py-2">
          <span className="text-xs text-stone-400">Sampai</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="text-sm text-stone-700 bg-transparent focus:outline-none" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="col-span-2 sm:col-span-1 bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-red-500" />
            </div>
            <span className="text-xs text-stone-400 font-medium">Total Pengeluaran</span>
          </div>
          <p className="text-2xl font-bold text-stone-800">{formatCurrency(total, currency)}</p>
          <p className="text-xs text-stone-400 mt-0.5">{(expenses as Expense[]).length} transaksi</p>
        </div>
        {Object.entries(byCategory).slice(0, 4).map(([cat, amt]) => (
          <div key={cat} className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-stone-400 truncate">{cat}</p>
            <p className="text-lg font-bold text-stone-800 mt-1">{formatCurrency(amt, currency)}</p>
          </div>
        ))}
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-stone-800 text-sm">{editItem ? 'Edit Pengeluaran' : 'Pengeluaran Baru'}</h2>
            <button onClick={resetForm} className="text-stone-400 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-100 transition-colors"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1.5 block">Kategori</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputCls}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1.5 block">Tanggal</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1.5 block">Keterangan</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Contoh: Beli tepung 5kg" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1.5 block">Jumlah (Rp)</label>
            <input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="50000" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1.5 block">Catatan (opsional)</label>
            <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Tambahkan catatan..." className={inputCls} />
          </div>
          <div className="flex gap-3">
            <button onClick={resetForm} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors">Batal</button>
            <button onClick={handleSave} disabled={saving || !form.description || !form.amount} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {saving ? 'Menyimpan…' : <><Check className="h-4 w-4" />{editItem ? 'Simpan' : 'Tambah'}</>}
            </button>
          </div>
        </div>
      )}

      {/* Expense list */}
      <div className="bg-white border border-stone-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-4 py-3.5 border-b border-stone-100">
          <h2 className="text-sm font-semibold text-stone-800">Daftar Pengeluaran</h2>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-stone-50 animate-pulse rounded-xl" />)}</div>
        ) : (expenses as Expense[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <TrendingDown className="h-8 w-8 text-stone-200" />
            <p className="text-sm text-stone-400">Belum ada pengeluaran di periode ini</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-50">
            {(expenses as Expense[]).map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">{e.category}</span>
                    <span className="text-xs text-stone-400">{e.date}</span>
                  </div>
                  <p className="text-sm text-stone-700 font-medium mt-0.5 truncate">{e.description}</p>
                  {e.note && <p className="text-xs text-stone-400 truncate">{e.note}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-red-500">-{formatCurrency(e.amount, currency)}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg text-stone-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => deleteMut.mutate(e.id)} className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
