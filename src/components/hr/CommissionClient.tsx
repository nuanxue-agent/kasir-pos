'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Trophy,
  Plus,
  X,
  TrendingUp,
  DollarSign,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Medal,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

interface CommissionClientProps {
  storeId: string
  currency: string
}

interface CommissionRule {
  id: string
  storeId: string
  employeeId: string | null
  employeeName?: string
  type: 'PERCENTAGE' | 'FLAT' | 'TIERED'
  value: number
  tiers: string | null
  effectiveFrom: string
}

interface CommissionSummary {
  employeeId: string
  employeeName: string
  position: string
  ordersClosed: number
  totalSales: number
  commissionEarned: number
}

// ── Rule Form ─────────────────────────────────────────────────────────────────
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
    type: rule?.type ?? 'PERCENTAGE',
    value: rule?.value ?? 0,
    tiersJson: rule?.tiers ?? '[{"upTo":10000000,"rate":2},{"upTo":null,"rate":3}]',
    effectiveFrom: rule?.effectiveFrom?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit() {
    setError('')
    setSaving(true)
    try {
      const tiers = form.type === 'TIERED' ? JSON.parse(form.tiersJson) : null
      const url = rule
        ? `/api/hr/commission-rules?storeId=${storeId}&id=${rule.id}`
        : `/api/hr/commission-rules?storeId=${storeId}`
      const res = await fetch(url, {
        method: rule ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: form.employeeId || null,
          type: form.type,
          value: Number(form.value),
          tiers,
          effectiveFrom: form.effectiveFrom,
        }),
      })
      if (res.ok) onSaved()
      else {
        const d = (await res.json()) as any
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
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
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
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
              Tipe Komisi
            </label>
            <select value={form.type} onChange={set('type')} className={inputCls}>
              <option value="PERCENTAGE">Persentase dari Penjualan (%)</option>
              <option value="FLAT">Flat per Order (Rp)</option>
              <option value="TIERED">Bertingkat (Tiered)</option>
            </select>
          </div>
          {form.type !== 'TIERED' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                {form.type === 'PERCENTAGE' ? 'Persentase (%)' : 'Nominal per Order (Rp)'}
              </label>
              <input
                type="number"
                min="0"
                step={form.type === 'PERCENTAGE' ? '0.1' : '1000'}
                value={form.value}
                onChange={set('value')}
                className={inputCls}
              />
            </div>
          )}
          {form.type === 'TIERED' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                Tiers (JSON) — upTo: batas penjualan, rate: % komisi. upTo: null = tidak terbatas
              </label>
              <textarea
                value={form.tiersJson}
                onChange={set('tiersJson')}
                rows={5}
                className={inputCls + ' resize-none font-mono text-xs'}
                placeholder='[{"upTo":10000000,"rate":2},{"upTo":null,"rate":3}]'
              />
              <p className="mt-1 text-xs text-[var(--text-3)]">
                Contoh: 2% s.d. 10jt, 3% di atas 10jt
              </p>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
              Berlaku Mulai
            </label>
            <input
              type="date"
              value={form.effectiveFrom}
              onChange={set('effectiveFrom')}
              className={inputCls}
            />
          </div>
        </div>
        <div className="flex gap-3 border-t border-[var(--border)] p-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-[var(--bg-muted)] py-2.5 text-sm font-semibold text-[var(--text-2)] hover:bg-stone-200"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
const TROPHY_COLORS = [
  'text-yellow-500',
  'text-slate-400',
  'text-amber-600',
  'text-[var(--text-3)]',
  'text-[var(--text-3)]',
]
const RANK_ICONS = [Trophy, Trophy, Medal, Medal, Medal]

function Leaderboard({ data, currency }: { data: CommissionSummary[]; currency: string }) {
  const top5 = [...data].sort((a, b) => b.totalSales - a.totalSales).slice(0, 5)
  if (top5.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-12 shadow-sm">
        <Trophy className="mb-3 h-10 w-10 text-stone-200" />
        <p className="text-sm text-[var(--text-3)]">Belum ada data penjualan</p>
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
              i === 0
                ? 'border-yellow-200 bg-gradient-to-r from-yellow-50 to-amber-50'
                : 'border-[var(--border)] bg-[var(--bg-card)]',
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              <Icon className={cn('h-6 w-6', TROPHY_COLORS[i])} />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--text-1)]">{emp.employeeName}</p>
                <p className="text-xs text-[var(--text-3)]">
                  {emp.ordersClosed} order · {formatCurrency(emp.totalSales, currency)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold text-emerald-600">
                  +{formatCurrency(emp.commissionEarned, currency)}
                </p>
                <p className="text-xs text-[var(--text-3)]">komisi</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CommissionClient({ storeId, currency }: CommissionClientProps) {
  const qc = useQueryClient()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [tab, setTab] = useState<'summary' | 'rules'>('summary')
  const [showForm, setShowForm] = useState(false)
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [calcResult, setCalcResult] = useState<string | null>(null)

  // Fetch employees for dropdowns
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees', storeId],
    queryFn: () => fetch(`/api/employees?storeId=${storeId}`).then(r => r.json()),
  })

  // Fetch commission summary
  const {
    data: summary = [],
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery<CommissionSummary[]>({
    queryKey: ['commission', storeId, month, year],
    queryFn: () =>
      fetch(`/api/hr/commission?storeId=${storeId}&month=${month}&year=${year}`).then(r => r.json()),
  })

  // Fetch commission rules
  const { data: rules = [], isLoading: rulesLoading } = useQuery<CommissionRule[]>({
    queryKey: ['commission-rules', storeId],
    queryFn: () => fetch(`/api/hr/commission-rules?storeId=${storeId}`).then(r => r.json()),
  })

  const deleteRule = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/hr/commission-rules?storeId=${storeId}&id=${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission-rules'] }),
  })

  async function calculate() {
    setCalculating(true)
    setCalcResult(null)
    const res = await fetch('/api/hr/commission/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, month, year }),
    })
    const d = (await res.json()) as any
    setCalculating(false)
    if (res.ok) {
      setCalcResult(`Berhasil: ${d.count ?? 0} karyawan dihitung`)
      refetchSummary()
      qc.invalidateQueries({ queryKey: ['commission'] })
    } else {
      setCalcResult(d.error ?? 'Gagal menghitung')
    }
  }

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const totalCommission = (summary as CommissionSummary[]).reduce(
    (s, r) => s + r.commissionEarned, 0,
  )
  const totalSales = (summary as CommissionSummary[]).reduce((s, r) => s + r.totalSales, 0)

  const TYPE_LABEL: Record<string, string> = {
    PERCENTAGE: 'Persentase',
    FLAT: 'Flat',
    TIERED: 'Bertingkat',
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Komisi Penjualan</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">
            Aturan komisi, ringkasan, dan papan peringkat
          </p>
        </div>
        {tab === 'rules' && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Tambah Aturan
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50">
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-xl font-bold text-[var(--text-1)]">
            {formatCurrency(totalCommission, currency)}
          </p>
          <p className="text-xs text-[var(--text-3)]">Total Komisi Bulan Ini</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50">
              <TrendingUp className="h-4 w-4 text-amber-500" />
            </div>
          </div>
          <p className="text-xl font-bold text-[var(--text-1)]">
            {formatCurrency(totalSales, currency)}
          </p>
          <p className="text-xs text-[var(--text-3)]">Total Penjualan Bulan Ini</p>
        </div>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 shadow-sm">
        <button onClick={prevMonth} className="rounded-lg p-1.5 hover:bg-[var(--bg-muted)]">
          <ChevronLeft className="h-4 w-4 text-[var(--text-2)]" />
        </button>
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[var(--text-1)]">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            onClick={calculate}
            disabled={calculating}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            <Calculator className="h-3.5 w-3.5" />
            {calculating ? 'Menghitung…' : 'Hitung Komisi'}
          </button>
        </div>
        <button onClick={nextMonth} className="rounded-lg p-1.5 hover:bg-[var(--bg-muted)]">
          <ChevronRight className="h-4 w-4 text-[var(--text-2)]" />
        </button>
      </div>
      {calcResult && (
        <p className={cn(
          'rounded-xl px-3 py-2 text-sm',
          calcResult.startsWith('Berhasil')
            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border border-red-200 bg-red-50 text-red-600',
        )}>
          {calcResult}
        </p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-[var(--bg-subtle)] p-1">
        {([
          { key: 'summary', label: 'Ringkasan & Leaderboard', icon: Trophy },
          { key: 'rules', label: 'Aturan Komisi', icon: TrendingUp },
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
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Summary + Leaderboard tab */}
      {tab === 'summary' && (
        <div className="space-y-6">
          {/* Leaderboard */}
          <div>
            <h2 className="mb-3 text-sm font-bold text-[var(--text-1)]">
              🏆 Top 5 Tenaga Penjual — {MONTH_NAMES[month - 1]} {year}
            </h2>
            <Leaderboard data={summary as CommissionSummary[]} currency={currency} />
          </div>

          {/* Full summary table */}
          <div>
            <h2 className="mb-3 text-sm font-bold text-[var(--text-1)]">Ringkasan Per Karyawan</h2>
            {summaryLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
                ))}
              </div>
            ) : (summary as CommissionSummary[]).length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-12 shadow-sm">
                <Calculator className="mb-3 h-10 w-10 text-stone-200" />
                <p className="text-sm text-[var(--text-3)]">
                  Belum ada data. Klik "Hitung Komisi" untuk menghitung.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--bg-muted)] text-xs text-[var(--text-2)]">
                    <tr>
                      {['Karyawan', 'Posisi', 'Order', 'Total Penjualan', 'Komisi'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {(summary as CommissionSummary[])
                      .sort((a, b) => b.totalSales - a.totalSales)
                      .map(row => (
                        <tr key={row.employeeId} className="hover:bg-[var(--bg-muted)]">
                          <td className="px-4 py-3 font-medium text-[var(--text-1)]">
                            {row.employeeName}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-2)]">{row.position}</td>
                          <td className="px-4 py-3 text-[var(--text-2)]">{row.ordersClosed}</td>
                          <td className="px-4 py-3 text-[var(--text-2)]">
                            {formatCurrency(row.totalSales, currency)}
                          </td>
                          <td className="px-4 py-3 font-bold text-emerald-600">
                            +{formatCurrency(row.commissionEarned, currency)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rules tab */}
      {tab === 'rules' && (
        <div className="space-y-3">
          {rulesLoading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
              ))}
            </div>
          ) : (rules as CommissionRule[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-12 shadow-sm">
              <TrendingUp className="mb-3 h-10 w-10 text-stone-200" />
              <p className="text-sm text-[var(--text-3)]">Belum ada aturan komisi</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 text-sm font-medium text-amber-500 hover:text-amber-600"
              >
                + Tambah aturan pertama
              </button>
            </div>
          ) : (
            (rules as CommissionRule[]).map(rule => (
              <div
                key={rule.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        {TYPE_LABEL[rule.type]}
                      </span>
                      <span className="text-sm font-semibold text-[var(--text-1)]">
                        {rule.employeeName ?? rule.employeeId ? `Khusus: ${rule.employeeName ?? rule.employeeId}` : 'Semua Karyawan'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-3)]">
                      {rule.type === 'PERCENTAGE' && `${rule.value}% dari penjualan`}
                      {rule.type === 'FLAT' && `Rp ${rule.value.toLocaleString('id-ID')} per order`}
                      {rule.type === 'TIERED' && 'Bertingkat (lihat detail JSON)'}
                      {' · '} Berlaku mulai {rule.effectiveFrom?.slice(0, 10)}
                    </p>
                    {rule.type === 'TIERED' && rule.tiers && (
                      <pre className="mt-2 rounded-lg bg-[var(--bg-subtle)] p-2 text-xs text-[var(--text-2)]">
                        {typeof rule.tiers === 'string'
                          ? JSON.stringify(JSON.parse(rule.tiers), null, 2)
                          : JSON.stringify(rule.tiers, null, 2)}
                      </pre>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setEditingRule(rule)}
                      className="rounded-lg p-1.5 hover:bg-[var(--bg-muted)]"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-[var(--text-2)]" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Hapus aturan ini?')) deleteRule.mutate(rule.id)
                      }}
                      className="rounded-lg p-1.5 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {(showForm || editingRule) && (
        <RuleForm
          storeId={storeId}
          employees={employees as any[]}
          rule={editingRule ?? undefined}
          onClose={() => { setShowForm(false); setEditingRule(null) }}
          onSaved={() => {
            setShowForm(false)
            setEditingRule(null)
            qc.invalidateQueries({ queryKey: ['commission-rules'] })
          }}
        />
      )}
    </div>
  )
}
