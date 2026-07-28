'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Trophy,
  Plus,
  X,
  TrendingUp,
  DollarSign,
  CheckCircle,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Settings,
  ReceiptText,
  Medal,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

type CommissionType = 'FIXED' | 'PERCENTAGE' | 'TIERED'
type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID'

interface CommissionClientProps {
  storeId: string
  currency: string
}

interface CommissionRule {
  id: string
  storeId: string
  employeeId: string | null
  employeeName?: string
  type: CommissionType
  value: number
  minSales: number
  maxSales: number | null
  productCategory: string | null
  tiers: Array<{ minSales: number; maxSales: number | null; rate: number }> | null
  active: boolean
}

interface CommissionEntry {
  id: string
  ruleId: string
  employeeId: string
  employeeName?: string
  orderId: string
  saleAmount: number
  commissionAmount: number
  period: string
  status: CommissionStatus
  paidAt: string | null
  createdAt: string
}

interface CommissionSummary {
  employeeId: string
  employeeName: string
  period: string
  totalSales: number
  totalCommission: number
  pendingCount: number
  approvedCount: number
  paidCount: number
  entryCount: number
}

const TYPE_LABEL: Record<CommissionType, string> = {
  FIXED: 'Flat per Order',
  PERCENTAGE: 'Persentase (%)',
  TIERED: 'Bertingkat',
}

const STATUS_CONFIG: Record<CommissionStatus, { label: string; pill: string }> = {
  PENDING: { label: 'Menunggu', pill: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
  APPROVED: { label: 'Disetujui', pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  PAID: { label: 'Dibayar', pill: 'bg-blue-50 text-blue-700 border border-blue-200' },
}

const TROPHY_COLORS = [
  'text-yellow-500', 'text-slate-400', 'text-amber-600', 'text-[var(--text-3)]', 'text-[var(--text-3)]',
]
const RANK_ICONS = [Trophy, Trophy, Medal, Medal, Medal]

function fmt(n: number, currency: string) {
  return formatCurrency(n, currency)
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7)
}

// ── Rule Form Modal ───────────────────────────────────────────────────────────
function RuleForm({
  storeId,
  employees,
  rule,
  onClose,
  onSaved,
}: {
  storeId: string
  employees: any[]
  rule?: CommissionRule
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    employeeId: rule?.employeeId ?? '',
    type: (rule?.type ?? 'PERCENTAGE') as CommissionType,
    value: String(rule?.value ?? 5),
    minSales: String(rule?.minSales ?? 0),
    maxSales: rule?.maxSales != null ? String(rule.maxSales) : '',
    productCategory: rule?.productCategory ?? '',
    tiersJson: rule?.tiers
      ? JSON.stringify(rule.tiers, null, 2)
      : '[{"minSales":0,"maxSales":10000000,"rate":2},{"minSales":10000000,"maxSales":null,"rate":3}]',
    active: rule?.active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit() {
    setError('')
    setSaving(true)
    try {
      let tiers = null
      if (form.type === 'TIERED') {
        tiers = JSON.parse(form.tiersJson)
      }
      const payload: any = {
        storeId,
        employeeId: form.employeeId || null,
        type: form.type,
        value: Number(form.value),
        minSales: Number(form.minSales),
        maxSales: form.maxSales ? Number(form.maxSales) : null,
        productCategory: form.productCategory || null,
        tiers,
        active: form.active,
      }
      const url = rule
        ? `/api/commission-rules/${rule.id}`
        : '/api/commission-rules'
      const res = await fetch(url, {
        method: rule ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success(rule ? 'Aturan diperbarui' : 'Aturan ditambahkan')
        onSaved()
      } else {
        const d = await res.json() as any
        setError(d.error ?? 'Gagal menyimpan')
      }
    } catch {
      setError('Format tiers tidak valid (harus JSON)')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-[var(--bg-card)] shadow-xl sm:max-w-lg sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-bold text-[var(--text-1)]">
            {rule ? 'Edit Aturan Komisi' : 'Tambah Aturan Komisi'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-muted)]">
            <X className="h-4 w-4 text-[var(--text-2)]" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
              Karyawan (kosong = berlaku untuk semua)
            </label>
            <select value={form.employeeId} onChange={set('employeeId')} className={inputCls}>
              <option value="">— Semua Karyawan —</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Tipe Komisi</label>
            <select value={form.type} onChange={set('type')} className={inputCls}>
              {(Object.keys(TYPE_LABEL) as CommissionType[]).map(t => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          {form.type !== 'TIERED' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                {form.type === 'PERCENTAGE' ? 'Persentase (%)' : 'Nominal per Order (Rp)'}
              </label>
              <input
                type="number" min="0" step={form.type === 'PERCENTAGE' ? '0.1' : '1000'}
                value={form.value} onChange={set('value')} className={inputCls}
              />
            </div>
          )}
          {form.type === 'TIERED' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                Tiers (JSON) — minSales, maxSales (null=tak terbatas), rate (%)
              </label>
              <textarea
                value={form.tiersJson} onChange={set('tiersJson')} rows={5}
                className={inputCls + ' resize-none font-mono text-xs'}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Min. Penjualan (Rp)</label>
              <input type="number" min="0" value={form.minSales} onChange={set('minSales')} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Maks. Penjualan (kosong=tak terbatas)</label>
              <input type="number" min="0" value={form.maxSales} onChange={set('maxSales')} placeholder="Tak terbatas" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Kategori Produk (opsional)</label>
            <input type="text" value={form.productCategory} onChange={set('productCategory')} placeholder="mis. Elektronik" className={inputCls} />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--text-1)] cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
              className="rounded"
            />
            Aturan aktif
          </label>
        </div>
        <div className="flex gap-3 border-t border-[var(--border)] p-4">
          <button onClick={onClose} className="flex-1 rounded-xl bg-[var(--bg-muted)] py-2.5 text-sm font-semibold text-[var(--text-2)] hover:bg-stone-200">
            Batal
          </button>
          <button
            onClick={handleSubmit} disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── New Entry Form Modal ──────────────────────────────────────────────────────
function EntryForm({
  storeId,
  employees,
  rules,
  onClose,
  onSaved,
}: {
  storeId: string
  employees: any[]
  rules: CommissionRule[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    ruleId: rules[0]?.id ?? '',
    employeeId: employees[0]?.id ?? '',
    orderId: '',
    saleAmount: '',
    commissionAmount: '',
    period: currentPeriod(),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit() {
    setError('')
    const saleAmount = parseFloat(form.saleAmount)
    const commissionAmount = parseFloat(form.commissionAmount)
    if (!form.orderId.trim()) return setError('ID Order harus diisi')
    if (isNaN(saleAmount) || saleAmount < 0) return setError('Nominal penjualan tidak valid')
    if (isNaN(commissionAmount) || commissionAmount < 0) return setError('Komisi tidak valid')
    setSaving(true)
    const res = await fetch('/api/commission-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId,
        ruleId: form.ruleId,
        employeeId: form.employeeId,
        orderId: form.orderId.trim(),
        saleAmount,
        commissionAmount,
        period: form.period,
      }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success('Entri komisi ditambahkan')
      onSaved()
    } else {
      const d = await res.json() as any
      setError(d.error ?? 'Gagal menyimpan')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-[var(--bg-card)] shadow-xl sm:max-w-md sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-bold text-[var(--text-1)]">Tambah Entri Komisi</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-muted)]">
            <X className="h-4 w-4 text-[var(--text-2)]" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Aturan Komisi</label>
            <select value={form.ruleId} onChange={set('ruleId')} className={inputCls}>
              {rules.map(r => (
                <option key={r.id} value={r.id}>
                  {r.employeeName ? `${r.employeeName} — ` : 'Semua — '}{TYPE_LABEL[r.type]}
                  {r.type === 'PERCENTAGE' ? ` ${r.value}%` : r.type === 'FIXED' ? ` Rp${r.value.toLocaleString()}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Karyawan</label>
            <select value={form.employeeId} onChange={set('employeeId')} className={inputCls}>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">ID Order</label>
            <input type="text" value={form.orderId} onChange={set('orderId')} placeholder="ORD-001" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Penjualan (Rp)</label>
              <input type="number" min="0" value={form.saleAmount} onChange={set('saleAmount')} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Komisi (Rp)</label>
              <input type="number" min="0" value={form.commissionAmount} onChange={set('commissionAmount')} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Periode</label>
            <input type="month" value={form.period} onChange={set('period')} className={inputCls} />
          </div>
        </div>
        <div className="flex gap-3 border-t border-[var(--border)] p-4">
          <button onClick={onClose} className="flex-1 rounded-xl bg-[var(--bg-muted)] py-2.5 text-sm font-semibold text-[var(--text-2)]">Batal</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
function Leaderboard({ data, currency }: { data: CommissionSummary[]; currency: string }) {
  const top5 = [...data].sort((a, b) => b.totalCommission - a.totalCommission).slice(0, 5)
  if (top5.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-12 shadow-sm">
        <Trophy className="mb-3 h-10 w-10 text-stone-200" />
        <p className="text-sm text-[var(--text-3)]">Belum ada data komisi</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {top5.map((emp, i) => {
        const Icon = RANK_ICONS[i]
        return (
          <div
            key={emp.employeeId}
            className={cn(
              'flex items-center gap-3 rounded-xl border p-4 shadow-sm',
              i === 0 ? 'border-yellow-200 bg-gradient-to-r from-yellow-50 to-amber-50' : 'border-[var(--border)] bg-[var(--bg-card)]',
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              <Icon className={cn('h-6 w-6', TROPHY_COLORS[i])} />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--text-1)]">{emp.employeeName ?? emp.employeeId}</p>
                <p className="text-xs text-[var(--text-3)]">
                  {emp.entryCount} entri &bull; {fmt(emp.totalSales, currency)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold text-emerald-600">+{fmt(emp.totalCommission, currency)}</p>
                <p className="text-xs text-[var(--text-3)]">komisi</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CommissionClient({ storeId, currency }: CommissionClientProps) {
  const qc = useQueryClient()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [tab, setTab] = useState<'summary' | 'entries' | 'rules'>('summary')
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null)

  const period = `${year}-${String(month).padStart(2, '0')}`

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['commission-summary', storeId] })
    qc.invalidateQueries({ queryKey: ['commission-entries', storeId] })
    qc.invalidateQueries({ queryKey: ['commission-rules', storeId] })
  }

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees', storeId],
    queryFn: () => fetch(`/api/employees?storeId=${storeId}`).then(r => r.json()),
  })

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['commission-summary', storeId, period],
    queryFn: async () => {
      const res = await fetch(`/api/commission-entries/summary?storeId=${storeId}&period=${period}`)
      return res.json() as Promise<{ data: CommissionSummary[]; period: string }>
    },
    enabled: tab === 'summary',
  })

  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['commission-entries', storeId, period],
    queryFn: async () => {
      const res = await fetch(`/api/commission-entries?storeId=${storeId}&period=${period}`)
      return res.json() as Promise<{ data: CommissionEntry[] }>
    },
    enabled: tab === 'entries',
  })

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ['commission-rules', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/commission-rules?storeId=${storeId}&active=false`)
      return res.json() as Promise<{ data: CommissionRule[] }>
    },
    enabled: tab === 'rules',
  })

  const summary: CommissionSummary[] = summaryData?.data ?? []
  const entries: CommissionEntry[] = entriesData?.data ?? []
  const rules: CommissionRule[] = rulesData?.data ?? []

  const totalCommission = summary.reduce((s, r) => s + r.totalCommission, 0)
  const totalSales = summary.reduce((s, r) => s + r.totalSales, 0)

  async function doEntryAction(id: string, action: 'approve' | 'pay') {
    const res = await fetch(`/api/commission-entries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (res.ok) {
      toast.success(action === 'approve' ? 'Disetujui' : 'Ditandai dibayar')
      invalidate()
    } else {
      const d = await res.json() as any
      toast.error(d.error ?? 'Gagal')
    }
  }

  async function toggleRuleActive(rule: CommissionRule) {
    const res = await fetch(`/api/commission-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !rule.active }),
    })
    if (res.ok) {
      toast.success(rule.active ? 'Aturan dinonaktifkan' : 'Aturan diaktifkan')
      invalidate()
    } else {
      toast.error('Gagal mengubah status aturan')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Komisi Penjualan</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">Aturan komisi, entri, dan ringkasan bulanan</p>
        </div>
        <div className="flex gap-2">
          {tab === 'rules' && (
            <button
              onClick={() => { setEditingRule(null); setShowRuleForm(true) }}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Tambah Aturan
            </button>
          )}
          {tab === 'entries' && (
            <button
              onClick={() => setShowEntryForm(true)}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
            >
              <Plus className="h-4 w-4" /> Tambah Entri
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50">
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-[var(--text-1)]">{fmt(totalCommission, currency)}</p>
          <p className="text-xs text-[var(--text-3)]">Total Komisi</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50">
            <TrendingUp className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-[var(--text-1)]">{fmt(totalSales, currency)}</p>
          <p className="text-xs text-[var(--text-3)]">Total Penjualan</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm col-span-2 sm:col-span-1">
          <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50">
            <ReceiptText className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-[var(--text-1)]">{summary.length}</p>
          <p className="text-xs text-[var(--text-3)]">Karyawan dengan Komisi</p>
        </div>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 shadow-sm">
        <button onClick={prevMonth} className="rounded-lg p-1.5 hover:bg-[var(--bg-muted)]">
          <ChevronLeft className="h-4 w-4 text-[var(--text-2)]" />
        </button>
        <span className="font-semibold text-[var(--text-1)]">{MONTH_NAMES[month - 1]} {year}</span>
        <button onClick={nextMonth} className="rounded-lg p-1.5 hover:bg-[var(--bg-muted)]">
          <ChevronRight className="h-4 w-4 text-[var(--text-2)]" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-[var(--bg-subtle)] p-1">
        {([
          { key: 'summary', label: 'Ringkasan', icon: Trophy },
          { key: 'entries', label: 'Entri Komisi', icon: ReceiptText },
          { key: 'rules', label: 'Aturan', icon: Settings },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
              tab === key
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Summary tab */}
      {tab === 'summary' && (
        <div className="space-y-6">
          <div>
            <h2 className="mb-3 text-sm font-bold text-[var(--text-1)]">
              Top Komisi — {MONTH_NAMES[month - 1]} {year}
            </h2>
            <Leaderboard data={summary} currency={currency} />
          </div>
          <div>
            <h2 className="mb-3 text-sm font-bold text-[var(--text-1)]">Ringkasan Per Karyawan</h2>
            {summaryLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
                ))}
              </div>
            ) : summary.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-12">
                <DollarSign className="mb-3 h-10 w-10 text-stone-200" />
                <p className="text-sm text-[var(--text-3)]">Belum ada data komisi untuk periode ini</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--bg-muted)] text-xs text-[var(--text-2)]">
                    <tr>
                      {['Karyawan', 'Total Penjualan', 'Komisi', 'Menunggu', 'Disetujui', 'Dibayar'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {[...summary].sort((a, b) => b.totalCommission - a.totalCommission).map(row => (
                      <tr key={row.employeeId} className="hover:bg-[var(--bg-muted)]">
                        <td className="px-4 py-3 font-medium text-[var(--text-1)]">{row.employeeName ?? row.employeeId}</td>
                        <td className="px-4 py-3 text-[var(--text-2)]">{fmt(row.totalSales, currency)}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-600">{fmt(row.totalCommission, currency)}</td>
                        <td className="px-4 py-3 text-[var(--text-2)]">{row.pendingCount}</td>
                        <td className="px-4 py-3 text-[var(--text-2)]">{row.approvedCount}</td>
                        <td className="px-4 py-3 text-[var(--text-2)]">{row.paidCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Entries tab */}
      {tab === 'entries' && (
        <div className="space-y-3">
          {entriesLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-12">
              <ReceiptText className="mb-3 h-10 w-10 text-stone-200" />
              <p className="text-sm text-[var(--text-3)]">Belum ada entri komisi untuk periode ini</p>
            </div>
          ) : entries.map((entry) => {
            const sc = STATUS_CONFIG[entry.status]
            return (
              <div key={entry.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--text-1)]">{entry.employeeName ?? entry.employeeId}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', sc.pill)}>{sc.label}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-2)]">Order: {entry.orderId}</p>
                    <p className="text-xs text-[var(--text-2)]">Periode: {entry.period}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-emerald-600">{fmt(entry.commissionAmount, currency)}</p>
                    <p className="text-xs text-[var(--text-2)]">dari {fmt(entry.saleAmount, currency)}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {entry.status === 'PENDING' && (
                    <button
                      onClick={() => doEntryAction(entry.id, 'approve')}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <CheckCircle className="h-3 w-3" /> Setujui
                    </button>
                  )}
                  {entry.status === 'APPROVED' && (
                    <button
                      onClick={() => doEntryAction(entry.id, 'pay')}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      <Banknote className="h-3 w-3" /> Bayar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Rules tab */}
      {tab === 'rules' && (
        <div className="space-y-3">
          {rulesLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />)}
            </div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-12">
              <Settings className="mb-3 h-10 w-10 text-stone-200" />
              <p className="text-sm text-[var(--text-3)]">Belum ada aturan komisi</p>
            </div>
          ) : rules.map(rule => (
            <div key={rule.id} className={cn(
              'rounded-2xl border p-4',
              rule.active ? 'border-[var(--border)] bg-[var(--bg-card)]' : 'border-[var(--border)] bg-[var(--bg-subtle)] opacity-60',
            )}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--text-1)]">
                      {rule.employeeName ?? 'Semua Karyawan'}
                    </span>
                    <span className="rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text-2)]">
                      {TYPE_LABEL[rule.type]}
                    </span>
                    {!rule.active && (
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">Nonaktif</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--text-2)]">
                    {rule.type === 'PERCENTAGE' && `${rule.value}% dari penjualan`}
                    {rule.type === 'FIXED' && `${fmt(rule.value, currency)} per order`}
                    {rule.type === 'TIERED' && `${rule.tiers?.length ?? 0} tier`}
                    {rule.minSales > 0 && ` · min ${fmt(rule.minSales, currency)}`}
                    {rule.maxSales != null && ` · maks ${fmt(rule.maxSales, currency)}`}
                    {rule.productCategory && ` · kategori: ${rule.productCategory}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => { setEditingRule(rule); setShowRuleForm(true) }}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--bg-muted)]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleRuleActive(rule)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-medium',
                      rule.active
                        ? 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                        : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                    )}
                  >
                    {rule.active ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showRuleForm && (
        <RuleForm
          storeId={storeId}
          employees={employees}
          rule={editingRule ?? undefined}
          onClose={() => { setShowRuleForm(false); setEditingRule(null) }}
          onSaved={() => { setShowRuleForm(false); setEditingRule(null); invalidate() }}
        />
      )}
      {showEntryForm && (
        <EntryForm
          storeId={storeId}
          employees={employees}
          rules={rules}
          onClose={() => setShowEntryForm(false)}
          onSaved={() => { setShowEntryForm(false); invalidate() }}
        />
      )}
    </div>
  )
}
