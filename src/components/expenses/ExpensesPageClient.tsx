'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Trash2,
  Pencil,
  TrendingDown,
  X,
  Check,
  RefreshCw,
  Camera,
  Tag,
  Settings,
  Download,
  PieChart,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

// Canonical expense categories (enum-style keys map to Indonesian labels)
export const EXPENSE_CATEGORY_KEYS = [
  'OPERASIONAL',
  'GAJI',
  'SEWA',
  'UTILITAS',
  'BAHAN_BAKU',
  'LAINNYA',
] as const
export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORY_KEYS)[number]
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryKey, string> = {
  OPERASIONAL: 'Operasional',
  GAJI: 'Gaji',
  SEWA: 'Sewa',
  UTILITAS: 'Utilitas',
  BAHAN_BAKU: 'Bahan Baku',
  LAINNYA: 'Lain-lain',
}

const DEFAULT_CATEGORIES = [
  'Bahan Baku',
  'Operasional',
  'Gaji',
  'Sewa',
  'Utilitas',
  'Pemasaran',
  'Peralatan',
  'Lain-lain',
]
const CATEGORY_COLORS = [
  '#f59e0b',
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#f97316',
  '#06b6d4',
  '#6b7280',
]

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

interface Props {
  storeId: string
  currency: string
}

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-[var(--text-1)] text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function monthStart() {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const over = pct >= 100
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]">
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
  const [filterCategory, setFilterCategory] = useState<string>('ALL')
  const [showChart, setShowChart] = useState(false)
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
    queryFn: () =>
      fetch(`/api/expenses?storeId=${storeId}&from=${from}&to=${to}`).then(r => r.json()),
  })

  const total = (expenses as Expense[]).reduce((s, e) => s + e.amount, 0)

  const byCategory = useMemo(
    () =>
      (expenses as Expense[]).reduce(
        (acc, e) => {
          acc[e.category] = (acc[e.category] ?? 0) + e.amount
          return acc
        },
        {} as Record<string, number>,
      ),
    [expenses],
  )

  // Filtered expense list by category
  const filteredExpenses = useMemo(
    () =>
      filterCategory === 'ALL'
        ? (expenses as Expense[])
        : (expenses as Expense[]).filter(e => e.category === filterCategory),
    [expenses, filterCategory],
  )

  // Donut chart data
  const chartData = useMemo(
    () =>
      Object.entries(byCategory).map(([name, value], i) => ({
        name,
        value,
        color: categoryMap[name]?.color ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      })),
    [byCategory, categoryMap],
  )

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/expenses/${id}?storeId=${storeId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  })

  function resetForm() {
    setForm({
      category: 'Operasional',
      description: '',
      amount: '',
      date: todayStr(),
      note: '',
      recurring: false,
    })
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
        body: JSON.stringify({
          name: newCatName.trim(),
          budget: Number(newCatBudget ?? 0),
          color: newCatColor,
        }),
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
      ...(expenses as Expense[]).map(e => [
        e.date,
        e.category,
        e.description,
        String(e.amount),
        e.note ?? '',
      ]),
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
    <div className="mx-auto max-w-4xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Pengeluaran</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">Catat biaya operasional tokomu</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowChart(v => !v)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${showChart ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)]'}`}
            title="Grafik Kategori"
          >
            <PieChart className="h-4 w-4" />
            <span className="hidden sm:inline">Grafik</span>
          </button>
          <button
            onClick={() => setShowCatMgr(v => !v)}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-subtle)]"
            title="Kelola Kategori"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Kategori</span>
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-subtle)]"
            title="Export CSV"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:shadow-amber-300 active:scale-95"
          >
            <Plus className="h-4 w-4" /> Tambah
          </button>
        </div>
      </div>

      {/* Category manager */}
      {showCatMgr && (
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
              <Tag className="h-4 w-4" /> Kelola Kategori
            </h2>
            <button
              onClick={() => setShowCatMgr(false)}
              className="rounded-lg p-1 text-[var(--text-3)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Existing categories with budgets */}
          {apiCategories.length > 0 && (
            <div className="space-y-2">
              {apiCategories.map((cat: ExpenseCategory) => {
                const spent = byCategory[cat.name] ?? 0
                return (
                  <div
                    key={cat.id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3"
                  >
                    <div
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: cat.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-[var(--text-1)]">{cat.name}</span>
                        {cat.budget > 0 && (
                          <span
                            className={`font-medium ${spent > cat.budget ? 'text-red-500' : 'text-[var(--text-2)]'}`}
                          >
                            {formatCurrency(spent, currency)} /{' '}
                            {formatCurrency(cat.budget, currency)}
                          </span>
                        )}
                      </div>
                      {cat.budget > 0 && (
                        <ProgressBar value={spent} max={cat.budget} color={cat.color} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* New category form */}
          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <p className="text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
              Tambah Kategori Baru
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                  Nama
                </label>
                <input
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder="Misal: Transportasi"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                  Anggaran/Bulan (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={newCatBudget}
                  onChange={e => setNewCatBudget(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Warna</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewCatColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${newCatColor === c ? 'scale-110 border-stone-700' : 'border-transparent'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={handleCreateCategory}
              disabled={savingCat || !newCatName.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingCat ? (
                'Menyimpan…'
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Simpan Kategori
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
          <span className="text-xs text-[var(--text-3)]">Dari</span>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="bg-transparent text-sm text-[var(--text-1)] focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
          <span className="text-xs text-[var(--text-3)]">Sampai</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="bg-transparent text-sm text-[var(--text-1)] focus:outline-none"
          />
        </div>
        {/* Category filter */}
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
          <Tag className="h-3.5 w-3.5 text-[var(--text-3)]" />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="bg-transparent text-sm text-[var(--text-1)] focus:outline-none"
          >
            <option value="ALL">Semua Kategori</option>
            {categoryNames.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Donut chart */}
      {showChart && chartData.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
            <PieChart className="h-4 w-4 text-amber-500" /> Pengeluaran per Kategori
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <RechartsPieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={value => formatCurrency(value as number, currency)}
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={value => <span className="text-xs text-[var(--text-2)]">{value}</span>}
              />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Budget progress cards (for categories that have a budget) */}
      {apiCategories.filter((c: ExpenseCategory) => c.budget > 0).length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {apiCategories
            .filter((c: ExpenseCategory) => c.budget > 0)
            .map((cat: ExpenseCategory) => {
              const spent = byCategory[cat.name] ?? 0
              const pct = Math.min(100, (spent / cat.budget) * 100)
              const over = spent > cat.budget
              return (
                <div
                  key={cat.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: cat.color }} />
                    <p className="truncate text-xs font-medium text-[var(--text-2)]">{cat.name}</p>
                  </div>
                  <p
                    className={`text-base font-bold ${over ? 'text-red-500' : 'text-[var(--text-1)]'}`}
                  >
                    {formatCurrency(spent, currency)}
                  </p>
                  <p className="mb-2 text-xs text-[var(--text-3)]">
                    dari {formatCurrency(cat.budget, currency)}
                  </p>
                  <ProgressBar value={spent} max={cat.budget} color={cat.color} />
                  <p
                    className={`mt-1 text-xs ${over ? 'font-medium text-red-500' : 'text-[var(--text-3)]'}`}
                  >
                    {over
                      ? `Melebihi ${formatCurrency(spent - cat.budget, currency)}`
                      : `Sisa ${formatCurrency(cat.budget - spent, currency)}`}
                  </p>
                </div>
              )
            })}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm sm:col-span-1">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-50">
              <TrendingDown className="h-4 w-4 text-red-500" />
            </div>
            <span className="text-xs font-medium text-[var(--text-3)]">Total Pengeluaran</span>
          </div>
          <p className="text-2xl font-bold text-[var(--text-1)]">
            {formatCurrency(total, currency)}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">
            {(expenses as Expense[]).length} transaksi
          </p>
        </div>
        {Object.entries(byCategory)
          .slice(0, 4)
          .map(([cat, amt]) => (
            <div
              key={cat}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm"
            >
              <div className="mb-1 flex items-center gap-2">
                {categoryMap[cat] && (
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: categoryMap[cat].color }}
                  />
                )}
                <p className="truncate text-xs text-[var(--text-3)]">{cat}</p>
              </div>
              <p className="mt-1 text-lg font-bold text-[var(--text-1)]">
                {formatCurrency(amt, currency)}
              </p>
            </div>
          ))}
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-1)]">
              {editItem ? 'Edit Pengeluaran' : 'Pengeluaran Baru'}
            </h2>
            <button
              onClick={resetForm}
              className="rounded-lg p-1 text-[var(--text-3)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Kategori
              </label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className={inputCls}
              >
                {categoryNames.map(c => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Tanggal
              </label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
              Keterangan
            </label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Contoh: Beli tepung 5kg"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
              Jumlah (Rp)
            </label>
            <input
              type="number"
              min="0"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="50000"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
              Catatan / URL Struk
            </label>
            <input
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Tambahkan catatan atau URL struk..."
              className={inputCls}
            />
          </div>

          {/* Receipt photo upload */}
          <div>
            <label className="mb-1.5 block flex items-center gap-1.5 text-xs font-medium text-[var(--text-2)]">
              <Camera className="h-3.5 w-3.5" /> Foto Struk (opsional)
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-stone-300 bg-[var(--bg-subtle)] px-3 py-2.5 transition-colors hover:bg-[var(--bg-muted)]">
              <Camera className="h-4 w-4 text-[var(--text-3)]" />
              <span className="text-sm text-[var(--text-3)]">Pilih foto struk...</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleReceiptUpload}
              />
            </label>
            {form.note?.startsWith('blob:') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.note}
                alt="Struk"
                className="mt-2 h-24 w-auto rounded-xl border border-[var(--border)] object-cover"
              />
            )}
          </div>

          {/* Recurring flag */}
          <label className="group flex cursor-pointer items-center gap-3">
            <div
              onClick={() => setForm(f => ({ ...f, recurring: !f.recurring }))}
              className={`relative h-5 w-9 rounded-full transition-colors ${form.recurring ? 'bg-amber-500' : 'bg-stone-200'}`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--bg-card)] shadow transition-all ${form.recurring ? 'left-4' : 'left-0.5'}`}
              />
            </div>
            <span className="flex items-center gap-1.5 text-sm text-[var(--text-2)]">
              <RefreshCw className="h-3.5 w-3.5 text-[var(--text-3)]" /> Pengeluaran berulang
              (otomatis tiap bulan)
            </span>
          </label>

          <div className="flex gap-3">
            <button
              onClick={resetForm}
              className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-subtle)]"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.description || !form.amount}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-50"
            >
              {saving ? (
                'Menyimpan…'
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {editItem ? 'Simpan' : 'Tambah'}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Expense list */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
          <h2 className="text-sm font-semibold text-[var(--text-1)]">Daftar Pengeluaran</h2>
          {filterCategory !== 'ALL' && (
            <button
              onClick={() => setFilterCategory('ALL')}
              className="flex items-center gap-1 text-xs text-amber-600 transition-colors hover:text-amber-800"
            >
              <X className="h-3 w-3" /> {filterCategory}
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
            ))}
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <TrendingDown className="h-8 w-8 text-stone-200" />
            <p className="text-sm text-[var(--text-3)]">Belum ada pengeluaran di periode ini</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filteredExpenses.map(e => {
              const catInfo = categoryMap[e.category]
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setFilterCategory(e.category)}
                        className="rounded-full border px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80"
                        style={
                          catInfo
                            ? {
                                background: `${catInfo.color}15`,
                                color: catInfo.color,
                                borderColor: `${catInfo.color}30`,
                              }
                            : { background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }
                        }
                      >
                        {e.category}
                      </button>
                      <span className="text-xs text-[var(--text-3)]">{e.date}</span>
                      {e.recurring && (
                        <span className="flex items-center gap-0.5 text-xs text-blue-500">
                          <RefreshCw className="h-3 w-3" /> berulang
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium text-[var(--text-1)]">
                      {e.description}
                    </p>
                    {e.note && !e.note.startsWith('blob:') && (
                      <p className="truncate text-xs text-[var(--text-3)]">{e.note}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-red-500">
                      -{formatCurrency(e.amount, currency)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => openEdit(e)}
                      className="rounded-lg p-1.5 text-[var(--text-3)] transition-colors hover:bg-amber-50 hover:text-amber-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteMut.mutate(e.id)}
                      className="rounded-lg p-1.5 text-[var(--text-3)] transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
