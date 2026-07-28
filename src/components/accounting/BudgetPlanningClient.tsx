'use client'
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { TrendingUp, TrendingDown, Plus, CheckCircle, Lock, FileText } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ──────────────────────────────────────────────────────────────────────

type BudgetPlanStatus = 'DRAFT' | 'APPROVED' | 'LOCKED'
type BudgetLineCategory = 'REVENUE' | 'EXPENSE'

interface BudgetPlan {
  id: string
  storeId: string
  year: number
  name: string
  status: BudgetPlanStatus
  totalRevenueBudget: number
  totalExpenseBudget: number
  approvedBy: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

interface BudgetLine {
  id: string
  planId: string
  storeId: string
  accountCode: string
  accountName: string
  category: BudgetLineCategory
  q1: number; q2: number; q3: number; q4: number; annual: number
  actualQ1: number; actualQ2: number; actualQ3: number; actualQ4: number; actualAnnual: number
}

interface VarianceLine extends BudgetLine {
  varQ1: number; varQ2: number; varQ3: number; varQ4: number; varAnnual: number
  varPctQ1: number; varPctQ2: number; varPctQ3: number; varPctQ4: number; varPctAnnual: number
  achievementPct: number
  favorable: boolean
}

interface VarianceReport {
  planId: string
  year: number
  name: string
  status: string
  lines: VarianceLine[]
  summary: {
    totalRevenueBudget: number
    totalRevenueActual: number
    totalRevenueVariance: number
    totalExpenseBudget: number
    totalExpenseActual: number
    totalExpenseVariance: number
    netBudget: number
    netActual: number
    netVariance: number
    overallAchievementPct: number
  }
}

interface BudgetPlanningClientProps {
  storeId: string
  currency: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const NAV_TABS = [
  { label: 'Ringkasan', href: '/dashboard/accounting' },
  { label: 'Chart of Accounts', href: '/dashboard/accounting/chart-of-accounts' },
  { label: 'Jurnal', href: '/dashboard/accounting/journal' },
  { label: 'Neraca Saldo', href: '/dashboard/accounting/trial-balance' },
  { label: 'Anggaran', href: '/dashboard/accounting/budget' },
  { label: 'Perencanaan Anggaran', href: '/dashboard/accounting/budget-planning' },
]

const STATUS_LABELS: Record<BudgetPlanStatus, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Disetujui',
  LOCKED: 'Terkunci',
}

const STATUS_COLORS: Record<BudgetPlanStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LOCKED: 'bg-slate-100 text-slate-600 border-slate-300',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtNum(n: number) { return n.toLocaleString('id-ID') }
function fmtPct(n: number) { return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` }
// ── Sub-navigation ─────────────────────────────────────────────────────────────

function SubNav() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {NAV_TABS.map(tab => {
        const active = pathname === tab.href
        return (
          <a
            key={tab.href}
            href={tab.href}
            className={cn(
              'whitespace-nowrap px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              active
                ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                : 'bg-[var(--bg-subtle)] text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--bg-muted)]'
            )}
          >
            {tab.label}
          </a>
        )
      })}
    </div>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BudgetPlanStatus }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border', STATUS_COLORS[status])}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ── Variance badge ─────────────────────────────────────────────────────────────

function VarianceBadge({ variance, favorable }: { variance: number; favorable: boolean }) {
  const color = favorable
    ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
    : 'text-rose-600 bg-rose-50 border-rose-200'
  const Icon = favorable ? TrendingUp : TrendingDown
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border', color)}>
      <Icon className="h-3 w-3" />
      {variance >= 0 ? '+' : ''}{fmtNum(variance)}
    </span>
  )
}

// ── Plan list ──────────────────────────────────────────────────────────────────

function PlanList({
  plans,
  selectedId,
  onSelect,
  onNew,
  creating,
}: {
  plans: BudgetPlan[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: (year: number) => void
  creating: boolean
}) {
  const currentYear = new Date().getFullYear()
  const [newYear, setNewYear] = useState(currentYear)

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[var(--text-1)]">Rencana Anggaran</h2>
      </div>

      {/* New plan form */}
      <div className="flex gap-2">
        <select
          value={newYear}
          onChange={e => setNewYear(Number(e.target.value))}
          className="flex-1 px-2 py-1.5 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)] text-xs"
        >
          {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          onClick={() => onNew(newYear)}
          disabled={creating}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          Buat
        </button>
      </div>

      {/* Plan list */}
      <div className="space-y-1">
        {plans.length === 0 && (
          <p className="text-xs text-[var(--text-3)] text-center py-4">Belum ada rencana anggaran</p>
        )}
        {plans.map(plan => (
          <button
            key={plan.id}
            onClick={() => onSelect(plan.id)}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-lg border transition-all',
              selectedId === plan.id
                ? 'border-amber-400 bg-amber-50'
                : 'border-[var(--border)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-muted)]'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--text-1)]">{plan.name}</span>
              <StatusBadge status={plan.status} />
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-[var(--text-3)]">
                Pendapatan: {fmtNum(plan.totalRevenueBudget)}
              </span>
              <span className="text-xs text-[var(--text-3)]">
                Beban: {fmtNum(plan.totalExpenseBudget)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
// ── Budget lines table ─────────────────────────────────────────────────────────

function LinesTab({
  planId,
  storeId,
  plan,
  currency,
}: {
  planId: string
  storeId: string
  plan: BudgetPlan
  currency: string
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    accountCode: '', accountName: '',
    category: 'REVENUE' as BudgetLineCategory,
    q1: '', q2: '', q3: '', q4: '',
  })
  const [showForm, setShowForm] = useState(false)

  const { data: lines = [], isLoading } = useQuery<BudgetLine[]>({
    queryKey: ['budget-lines', planId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-plans/${planId}/lines?storeId=${storeId}`)
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal memuat baris anggaran')
      return data as BudgetLine[]
    },
  })

  const addLine = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/budget-plans/${planId}/lines?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountCode: form.accountCode,
          accountName: form.accountName,
          category: form.category,
          q1: Number(form.q1 || 0),
          q2: Number(form.q2 || 0),
          q3: Number(form.q3 || 0),
          q4: Number(form.q4 || 0),
        }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal menambah baris')
      return data
    },
    onSuccess: () => {
      toast.success('Baris anggaran ditambahkan')
      qc.invalidateQueries({ queryKey: ['budget-lines', planId] })
      qc.invalidateQueries({ queryKey: ['budget-plans', storeId] })
      setForm({ accountCode: '', accountName: '', category: 'REVENUE', q1: '', q2: '', q3: '', q4: '' })
      setShowForm(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const revLines = lines.filter(l => l.category === 'REVENUE')
  const expLines = lines.filter(l => l.category === 'EXPENSE')

  const totalRevBudget = revLines.reduce((s, l) => s + l.annual, 0)
  const totalExpBudget = expLines.reduce((s, l) => s + l.annual, 0)

  function renderSection(title: string, sectionLines: BudgetLine[], color: string) {
    return (
      <div>
        <div className={cn('px-3 py-1.5 text-xs font-bold rounded-t-lg', color)}>
          {title}
        </div>
        <table className="w-full text-xs min-w-[600px]">
          <thead>
            <tr className="bg-[var(--bg-subtle)] border-b border-[var(--border)]">
              <th className="text-left px-3 py-2 font-semibold text-[var(--text-2)] w-24">Kode</th>
              <th className="text-left px-3 py-2 font-semibold text-[var(--text-2)]">Nama Akun</th>
              <th className="text-right px-3 py-2 font-semibold text-[var(--text-2)]">Q1</th>
              <th className="text-right px-3 py-2 font-semibold text-[var(--text-2)]">Q2</th>
              <th className="text-right px-3 py-2 font-semibold text-[var(--text-2)]">Q3</th>
              <th className="text-right px-3 py-2 font-semibold text-[var(--text-2)]">Q4</th>
              <th className="text-right px-3 py-2 font-semibold text-[var(--text-2)]">Tahunan</th>
            </tr>
          </thead>
          <tbody>
            {sectionLines.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-[var(--text-3)]">
                  Belum ada baris
                </td>
              </tr>
            )}
            {sectionLines.map(line => (
              <tr key={line.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-subtle)]">
                <td className="px-3 py-2 text-[var(--text-3)]">{line.accountCode}</td>
                <td className="px-3 py-2 font-medium text-[var(--text-1)]">{line.accountName}</td>
                <td className="px-3 py-2 text-right text-[var(--text-2)]">{fmtNum(line.q1)}</td>
                <td className="px-3 py-2 text-right text-[var(--text-2)]">{fmtNum(line.q2)}</td>
                <td className="px-3 py-2 text-right text-[var(--text-2)]">{fmtNum(line.q3)}</td>
                <td className="px-3 py-2 text-right text-[var(--text-2)]">{fmtNum(line.q4)}</td>
                <td className="px-3 py-2 text-right font-semibold text-[var(--text-1)]">{fmtNum(line.annual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Add line button */}
      {plan.status !== 'LOCKED' && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Baris
          </button>
        </div>
      )}

      {/* Add line form */}
      {showForm && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-1)]">Tambah Baris Anggaran</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-2)] font-medium">Kode Akun</label>
              <input
                value={form.accountCode}
                onChange={e => setForm(p => ({ ...p, accountCode: e.target.value }))}
                placeholder="4-001"
                className="mt-1 w-full px-3 py-1.5 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)] text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-2)] font-medium">Nama Akun</label>
              <input
                value={form.accountName}
                onChange={e => setForm(p => ({ ...p, accountName: e.target.value }))}
                placeholder="Pendapatan Penjualan"
                className="mt-1 w-full px-3 py-1.5 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)] text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-2)] font-medium">Kategori</label>
              <select
                value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value as BudgetLineCategory }))}
                className="mt-1 w-full px-3 py-1.5 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)] text-xs"
              >
                <option value="REVENUE">Pendapatan</option>
                <option value="EXPENSE">Beban</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(['q1', 'q2', 'q3', 'q4'] as const).map(q => (
              <div key={q}>
                <label className="text-xs text-[var(--text-2)] font-medium">{q.toUpperCase()}</label>
                <input
                  type="number"
                  value={form[q]}
                  onChange={e => setForm(p => ({ ...p, [q]: e.target.value }))}
                  placeholder="0"
                  className="mt-1 w-full px-2 py-1.5 border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-1)] text-xs text-right"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-2)] text-xs hover:bg-[var(--bg-muted)] transition-colors"
            >
              Batal
            </button>
            <button
              onClick={() => addLine.mutate()}
              disabled={addLine.isPending || !form.accountName}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {addLine.isPending ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-[var(--text-3)] text-sm">Memuat...</div>
      ) : (
        <div className="overflow-x-auto space-y-4">
          {renderSection('Pendapatan', revLines, 'bg-emerald-50 text-emerald-700')}
          {renderSection('Beban', expLines, 'bg-rose-50 text-rose-700')}
          {/* Totals */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3">
              <p className="text-xs text-[var(--text-3)]">Total Anggaran Pendapatan</p>
              <p className="text-base font-bold text-emerald-600 mt-1">{formatCurrency(totalRevBudget, currency)}</p>
            </div>
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3">
              <p className="text-xs text-[var(--text-3)]">Total Anggaran Beban</p>
              <p className="text-base font-bold text-rose-600 mt-1">{formatCurrency(totalExpBudget, currency)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
// ── Variance tab ───────────────────────────────────────────────────────────────

function VarianceTab({
  planId,
  storeId,
  currency,
}: {
  planId: string
  storeId: string
  currency: string
}) {
  const { data: report, isLoading } = useQuery<VarianceReport>({
    queryKey: ['budget-variance', planId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-plans/${planId}/variance?storeId=${storeId}`)
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal memuat variansi')
      return data as VarianceReport
    },
  })

  if (isLoading) return <div className="text-center py-8 text-[var(--text-3)] text-sm">Memuat...</div>
  if (!report) return null

  const { summary } = report

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Anggaran Pendapatan', value: summary.totalRevenueBudget, color: 'text-emerald-600' },
          { label: 'Aktual Pendapatan', value: summary.totalRevenueActual, color: 'text-blue-600' },
          { label: 'Anggaran Beban', value: summary.totalExpenseBudget, color: 'text-rose-600' },
          { label: 'Aktual Beban', value: summary.totalExpenseActual, color: 'text-orange-600' },
        ].map(c => (
          <div key={c.label} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3">
            <p className="text-xs text-[var(--text-3)]">{c.label}</p>
            <p className={cn('text-base font-bold mt-1', c.color)}>{formatCurrency(c.value, currency)}</p>
          </div>
        ))}
      </div>

      {/* Net summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Laba Bersih Anggaran', value: summary.netBudget, color: 'text-[var(--text-1)]' },
          { label: 'Laba Bersih Aktual', value: summary.netActual, color: summary.netActual >= 0 ? 'text-emerald-600' : 'text-rose-600' },
          { label: 'Variansi Bersih', value: summary.netVariance, color: summary.netVariance >= 0 ? 'text-emerald-600' : 'text-rose-600' },
        ].map(c => (
          <div key={c.label} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3">
            <p className="text-xs text-[var(--text-3)]">{c.label}</p>
            <p className={cn('text-lg font-bold mt-1', c.color)}>{formatCurrency(c.value, currency)}</p>
          </div>
        ))}
      </div>

      {/* Achievement */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-[var(--text-1)]">Pencapaian Pendapatan</span>
          <span className="text-sm font-bold text-amber-600">{summary.overallAchievementPct.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-[var(--bg-subtle)] rounded-full h-2.5">
          <div
            className="bg-amber-500 h-2.5 rounded-full transition-all"
            style={{ width: `${Math.min(summary.overallAchievementPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Lines variance table */}
      {(['REVENUE', 'EXPENSE'] as BudgetLineCategory[]).map(cat => {
        const catLines = report.lines.filter(l => l.category === cat)
        if (catLines.length === 0) return null
        return (
          <div key={cat} className="overflow-x-auto">
            <div className={cn('px-3 py-1.5 text-xs font-bold rounded-t-lg',
              cat === 'REVENUE' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            )}>
              {cat === 'REVENUE' ? 'Pendapatan' : 'Beban'}
            </div>
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="bg-[var(--bg-subtle)] border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 font-semibold text-[var(--text-2)]">Akun</th>
                  <th className="text-right px-3 py-2 font-semibold text-[var(--text-2)]">Q1 Angg.</th>
                  <th className="text-right px-3 py-2 font-semibold text-[var(--text-2)]">Q1 Aktual</th>
                  <th className="text-right px-3 py-2 font-semibold text-[var(--text-2)]">Q1 Var.</th>
                  <th className="text-right px-3 py-2 font-semibold text-[var(--text-2)]">Tahunan Angg.</th>
                  <th className="text-right px-3 py-2 font-semibold text-[var(--text-2)]">Tahunan Aktual</th>
                  <th className="text-right px-3 py-2 font-semibold text-[var(--text-2)]">Var. Tahunan</th>
                  <th className="text-center px-3 py-2 font-semibold text-[var(--text-2)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {catLines.map(line => (
                  <tr key={line.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-subtle)]">
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--text-1)]">{line.accountName}</div>
                      <div className="text-[var(--text-3)]">{line.accountCode}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--text-2)]">{fmtNum(line.q1)}</td>
                    <td className="px-3 py-2 text-right text-[var(--text-2)]">{fmtNum(line.actualQ1)}</td>
                    <td className={cn('px-3 py-2 text-right font-semibold',
                      line.varQ1 >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    )}>
                      {fmtNum(line.varQ1)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-[var(--text-1)]">{fmtNum(line.annual)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[var(--text-1)]">{fmtNum(line.actualAnnual)}</td>
                    <td className="px-3 py-2 text-right">
                      <VarianceBadge variance={line.varAnnual} favorable={line.favorable} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn('text-xs font-semibold', line.favorable ? 'text-emerald-600' : 'text-rose-600')}>
                        {line.achievementPct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BudgetPlanningClient({ storeId, currency }: BudgetPlanningClientProps) {
  const qc = useQueryClient()
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [tab, setTab] = useState<'lines' | 'variance'>('lines')

  // ── Fetch plans ────────────────────────────────────────────────────────────
  const { data: plans = [], isLoading: loadingPlans } = useQuery<BudgetPlan[]>({
    queryKey: ['budget-plans', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-plans?storeId=${storeId}`)
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal memuat rencana anggaran')
      return data as BudgetPlan[]
    },
  })

  const selectedPlan = useMemo(
    () => plans.find(p => p.id === selectedPlanId) ?? null,
    [plans, selectedPlanId]
  )

  // ── Create plan ────────────────────────────────────────────────────────────
  const createPlan = useMutation({
    mutationFn: async (year: number) => {
      const res = await fetch(`/api/budget-plans?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal membuat rencana anggaran')
      return data as BudgetPlan
    },
    onSuccess: (newPlan) => {
      toast.success(`Rencana anggaran ${newPlan.year} dibuat`)
      qc.invalidateQueries({ queryKey: ['budget-plans', storeId] })
      setSelectedPlanId(newPlan.id)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Approve plan ───────────────────────────────────────────────────────────
  const approvePlan = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/budget-plans/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal menyetujui anggaran')
      return data
    },
    onSuccess: () => {
      toast.success('Anggaran disetujui')
      qc.invalidateQueries({ queryKey: ['budget-plans', storeId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Lock plan ──────────────────────────────────────────────────────────────
  const lockPlan = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/budget-plans/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'LOCKED' }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal mengunci anggaran')
      return data
    },
    onSuccess: () => {
      toast.success('Anggaran dikunci')
      qc.invalidateQueries({ queryKey: ['budget-plans', storeId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-full">
      {/* Sub-nav */}
      <SubNav />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--text-1)]">Perencanaan Anggaran Tahunan</h1>
        <p className="text-sm text-[var(--text-3)] mt-0.5">
          Buat, kelola, dan analisis anggaran tahunan per akun dengan variansi per kuartal
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        {/* Left: plan list */}
        {loadingPlans ? (
          <div className="text-center py-8 text-[var(--text-3)] text-sm">Memuat...</div>
        ) : (
          <PlanList
            plans={plans}
            selectedId={selectedPlanId}
            onSelect={(id) => { setSelectedPlanId(id); setTab('lines') }}
            onNew={(year) => createPlan.mutate(year)}
            creating={createPlan.isPending}
          />
        )}

        {/* Right: detail */}
        {selectedPlan ? (
          <div className="space-y-4">
            {/* Plan header */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-500" />
                  <h2 className="text-base font-bold text-[var(--text-1)]">{selectedPlan.name}</h2>
                  <StatusBadge status={selectedPlan.status} />
                </div>
                {selectedPlan.approvedBy && (
                  <p className="text-xs text-[var(--text-3)] mt-1">
                    Disetujui oleh: {selectedPlan.approvedBy}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {selectedPlan.status === 'DRAFT' && (
                  <button
                    onClick={() => approvePlan.mutate(selectedPlan.id)}
                    disabled={approvePlan.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Setujui
                  </button>
                )}
                {selectedPlan.status === 'APPROVED' && (
                  <button
                    onClick={() => lockPlan.mutate(selectedPlan.id)}
                    disabled={lockPlan.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-600 text-white text-xs font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Kunci
                  </button>
                )}
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-[var(--border)]">
              {([
                { key: 'lines', label: 'Baris Anggaran' },
                { key: 'variance', label: 'Analisis Variansi' },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
                    tab === t.key
                      ? 'border-amber-500 text-amber-600'
                      : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === 'lines' && (
              <LinesTab
                planId={selectedPlan.id}
                storeId={storeId}
                plan={selectedPlan}
                currency={currency}
              />
            )}
            {tab === 'variance' && (
              <VarianceTab
                planId={selectedPlan.id}
                storeId={storeId}
                currency={currency}
              />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-12 text-[var(--text-3)] text-sm">
            Pilih rencana anggaran untuk melihat detail
          </div>
        )}
      </div>
    </div>
  )
}
