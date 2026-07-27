'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, TrendingDown, X, Check, RefreshCw, Camera, Tag, Settings, Download } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

const DEFAULT_CATEGORIES = ['Bahan Baku', 'Operasional', 'Gaji', 'Sewa', 'Utilitas', 'Pemasaran', 'Peralatan', 'Lain-lain']
const CATEGORY_COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f97316', '#06b6d4', '#6b7280']

interface ExpenseCategory {
  id: string
  name: string
  budget: number
  color: string
}

interface Expense {
  id: string
  category: string
  description: string
  amount: number
  date: string
  note?: string | null
  recurring?: boolean
}

interface Props { storeId: string; currency: string }

const inputCls = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

function todayStr() { return new Date().toISOString().slice(0, 10) }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const over = pct >= 100
  return (
    <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: over ? '#ef4444' : color }}
      />
    </div>
  )
}

export default function ExpensesPageClient({ storeId, currency }: Props) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Expense | null>(null)
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayStr())
  const [form, setForm] = useState({
    category: 'Operasional',
    description: '',
    amount: '',
    date: todayStr(),
    note: '',
    recurring: false,
  })
  const [saving, setSaving] = useState(false)
  const [showCatMgr, setShowCatMgr] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatBudget, setNewCatBudget] = useState('')
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0])
  const [savingCat, setSavingCat] = useState(false)

  // Expense categories from API (falls back to defaults)
  const { data: apiCategories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories', storeId],
    queryFn: () => fetch(`/api/expense-categories?storeId=${storeId}`).then(r => r.json()),
  })

  const categoryNames: string[] = useMemo(() => {
    const fromApi = apiCategories.map((c: ExpenseCategory) => c.name)
    const merged = [...new Set([...fromApi, ...DEFAULT_CATEGORIES])]
    return merged
  }, [apiCategories])

  const categoryMap = useMemo(() => {
    return Object.fromEntries(apiCategories.map((c: ExpenseCategory) => [c.name, c]))
  }, [apiCategories])

  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ['expenses', storeId, from, to],
    queryFn: () => fetch(`/api/expenses?storeId=${storeId}&from=${from}&to=${to}`).then(r => r.json()),
  })

  const total = (expenses as Expense[]).reduce((s, e) => s + e.amount, 0)

  const byCategory = useMemo(() =>
    (expenses as Expense[]).reduce((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount
      return acc
    }, {} as Record<string, number>),
    [expenses]
  )

  const deleteMut = useMutation({
    mutationFn: (id: string) => fetch(`/api/expenses/${id}?storeId=${storeId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  })

  function resetForm() {
    setForm({ category: 'Operasional', description: '', amount: '', date: todayStr(), note: '', recurring: false })
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
    setForm({
      category: e.category,
      description: e.description,
      amount: String(e.amount),
      date: e.date,
      note: e.note ?? '',
      recurring: e.recurring ?? false,
    })
    setEditItem(e)
    setShowForm(true)
  }

  async function handleCreateCategory() {
    if (!newCatName.trim()) return
    setSavingCat(true)
    try {
      await fetch(`/api/expense-categories?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName.trim(), budget: Number(newCatBudget ?? 0), color: newCatColor }),
      })
      qc.invalidateQueries({ queryKey: ['expense-categories'] })
      setNewCatName('')
      setNewCatBudget('')
      setNewCatColor(CATEGORY_COLORS[0])
    } finally {
      setSavingCat(false)
    }
  }

  function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Store as object URL in the note field for now
    const url = URL.createObjectURL(file)
    setForm(f => ({ ...f, note: url }))
  }

  function exportCSV() {
    const rows = [
      ['Tanggal', 'Kategori', 'Keterangan', 'Jumlah', 'Catatan'],
      ...(expenses as Expense[]).map(e => [e.date, e.category, e.description, String(e.amount), e.note ?? '']),
    ]
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pengeluaran-${from}-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Pengeluaran</h1>
          <p className="text-stone-400 text-sm mt-0.5">Catat biaya operasional tokomu</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowCatMgr(v => !v)}
            className="flex items-center gap-1.5 border border-stone-200 text-stone-600 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-50 transition-all"
            title="Kelola Kategori"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Kategori</span>
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 border border-stone-200 text-stone-600 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-50 transition-all"
            title="Export CSV"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-md shadow-amber-200 hover:shadow-amber-300 transition-all active:scale-95"
          >
            <Plus className="h-4 w-4" /> Tambah
          </button>
        </div>
      </div>

      {/* Category manager */}
      {showCatMgr && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-stone-800 text-sm flex items-center gap-2"><Tag className="h-4 w-4" /> Kelola Kategori</h2>
            <button onClick={() => setShowCatMgr(false)} className="text-stone-400 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-100 transition-colors"><X className="h-4 w-4" /></button>
          </div>

          {/* Existing categories with budgets */}
          {apiCategories.length > 0 && (
            <div className="space-y-2">
              {apiCategories.map((cat: ExpenseCategory) => {
                const spent = byCategory[cat.name] ?? 0
                return (
                  <div key={cat.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl border border-stone-100">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-stone-700">{cat.name}</span>
                        {cat.budget > 0 && (
                          <span className={`font-medium ${spent > cat.budget ? 'text-red-500' : 'text-stone-500'}`}>
                            {formatCurrency(spent, currency)} / {formatCurrency(cat.budget, currency)}
                          </span>
                        )}
                      </div>
                      {cat.budget > 0 && <ProgressBar value={spent} max={cat.budget} color={cat.color} />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* New category form */}
          <div className="border-t border-stone-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Tambah Kategori Baru</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-stone-500 mb-1.5 block">Nama</label>
                <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Misal: Transportasi" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 mb-1.5 block">Anggaran/Bulan (Rp)</label>
                <input type="number" min="0" value={newCatBudget} onChange={e => setNewCatBudget(e.target.value)} placeholder="0" className={inputCls} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1.5 block">Warna</label>
              <div className="flex gap-2 flex-wrap">
                {CATEGORY_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewCatColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${newCatColor === c ? 'border-stone-700 scale-110' : 'border-transparent'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={handleCreateCategory}
              disabled={savingCat || !newCatName.trim()}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {savingCat ? 'Menyimpan…' : <><Plus className="h-4 w-4" /> Simpan Kategori</>}
            </button>
          </div>
        </div>
      )}

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

      {/* Budget progress cards (for categories that have a budget) */}
      {apiCategories.filter((c: ExpenseCategory) => c.budget > 0).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {apiCategories.filter((c: ExpenseCategory) => c.budget > 0).map((cat: ExpenseCategory) => {
            const spent = byCategory[cat.name] ?? 0
            const pct = Math.min(100, (spent / cat.budget) * 100)
            const over = spent > cat.budget
            return (
              <div key={cat.id} className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: cat.color }} />
                  <p className="text-xs text-stone-500 font-medium truncate">{cat.name}</p>
                </div>
                <p className={`text-base font-bold ${over ? 'text-red-500' : 'text-stone-800'}`}>{formatCurrency(spent, currency)}</p>
                <p className="text-xs text-stone-400 mb-2">dari {formatCurrency(cat.budget, currency)}</p>
                <ProgressBar value={spent} max={cat.budget} color={cat.color} />
                <p className={`text-xs mt-1 ${over ? 'text-red-500 font-medium' : 'text-stone-400'}`}>
                  {over ? `Melebihi ${formatCurrency(spent - cat.budget, currency)}` : `Sisa ${formatCurrency(cat.budget - spent, currency)}`}
                </p>
              </div>
            )
          })}
        </div>
      )}

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
            <div className="flex items-center gap-2 mb-1">
              {categoryMap[cat] && (
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: categoryMap[cat].color }} />
              )}
              <p className="text-xs text-stone-400 truncate">{cat}</p>
            </div>
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
                {categoryNames.map(c => <option key={c}>{c}</option>)}
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
            <label className="text-xs font-medium text-stone-500 mb-1.5 block">Catatan / URL Struk</label>
            <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Tambahkan catatan atau URL struk..." className={inputCls} />
          </div>

          {/* Receipt photo upload */}
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1.5 block flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5" /> Foto Struk (opsional)
            </label>
            <label className="flex items-center gap-2 cursor-pointer bg-stone-50 border border-dashed border-stone-300 rounded-xl px-3 py-2.5 hover:bg-stone-100 transition-colors">
              <Camera className="h-4 w-4 text-stone-400" />
              <span className="text-sm text-stone-400">Pilih foto struk...</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleReceiptUpload} />
            </label>
            {form.note?.startsWith('blob:') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.note} alt="Struk" className="mt-2 h-24 w-auto rounded-xl object-cover border border-stone-200" />
            )}
          </div>

          {/* Recurring flag */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              onClick={() => setForm(f => ({ ...f, recurring: !f.recurring }))}
              className={`w-9 h-5 rounded-full transition-colors relative ${form.recurring ? 'bg-amber-500' : 'bg-stone-200'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.recurring ? 'left-4' : 'left-0.5'}`} />
            </div>
            <span className="text-sm text-stone-600 flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5 text-stone-400" /> Pengeluaran berulang (otomatis tiap bulan)
            </span>
          </label>

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
            {(expenses as Expense[]).map(e => {
              const catInfo = categoryMap[e.category]
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium border"
                        style={catInfo
                          ? { background: `${catInfo.color}15`, color: catInfo.color, borderColor: `${catInfo.color}30` }
                          : { background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }
                        }
                      >
                        {e.category}
                      </span>
                      <span className="text-xs text-stone-400">{e.date}</span>
                      {e.recurring && (
                        <span className="text-xs flex items-center gap-0.5 text-blue-500">
                          <RefreshCw className="h-3 w-3" /> berulang
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-stone-700 font-medium mt-0.5 truncate">{e.description}</p>
                    {e.note && !e.note.startsWith('blob:') && <p className="text-xs text-stone-400 truncate">{e.note}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-red-500">-{formatCurrency(e.amount, currency)}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg text-stone-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => deleteMut.mutate(e.id)} className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
