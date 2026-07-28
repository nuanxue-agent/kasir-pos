'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import {
  FileText,
  Download,
  Plus,
  CheckCircle,
  Clock,
  CreditCard,
  RefreshCw,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Pure tax calculation logic (exported for tests) ───────────────────────────

export const PPN_RATE = 0.11

export function calcPPN(taxableAmount: number): number {
  return Math.round(taxableAmount * PPN_RATE * 100) / 100
}

/**
 * PPh 21 progressive rates (annual PKP brackets, 2024):
 *   0–60 jt       →  5%
 *   60–250 jt     → 15%
 *   250–500 jt    → 25%
 *   500 jt–5 M    → 30%
 *   >5 M          → 35%
 */
export interface PPh21Bracket {
  limit: number
  rate: number
}

export const PPH21_BRACKETS: PPh21Bracket[] = [
  { limit: 60_000_000,    rate: 0.05 },
  { limit: 250_000_000,   rate: 0.15 },
  { limit: 500_000_000,   rate: 0.25 },
  { limit: 5_000_000_000, rate: 0.30 },
  { limit: Infinity,      rate: 0.35 },
]

/** Annual gross income → annual PPh 21 tax (progressive, no PTKP deduction) */
export function calcPPh21(annualIncome: number): number {
  let remaining = annualIncome
  let tax = 0
  let prevLimit = 0

  for (const bracket of PPH21_BRACKETS) {
    if (remaining <= 0) break
    const bandSize = bracket.limit - prevLimit
    const taxable = Math.min(remaining, bandSize)
    tax += taxable * bracket.rate
    remaining -= taxable
    prevLimit = bracket.limit
  }

  return Math.round(tax * 100) / 100
}

/** PPh 23 — service fee (2%) or dividend/interest/royalty (15%) */
export type PPh23Type = 'SERVICE' | 'DIVIDEND'
export const PPH23_RATES: Record<PPh23Type, number> = {
  SERVICE:  0.02,
  DIVIDEND: 0.15,
}

export function calcPPh23(amount: number, type: PPh23Type): number {
  return Math.round(amount * PPH23_RATES[type] * 100) / 100
}

/**
 * Tax due dates (Indonesian DJP rules):
 *   PPh 21 → 10th of following month
 *   PPh 23 → 10th of following month
 *   PPN    → end of following month
 */
export type TaxType = 'PPH21' | 'PPH23' | 'PPN'

export function taxDueDate(type: TaxType, periodYear: number, periodMonth: number): Date {
  // periodMonth is 1-indexed
  const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1
  const nextYear  = periodMonth === 12 ? periodYear + 1 : periodYear

  if (type === 'PPN') {
    // Last day of following month
    return new Date(nextYear, nextMonth, 0) // day=0 → last day of nextMonth-1
  }
  // PPh 21 & PPh 23 → 10th of following month
  return new Date(nextYear, nextMonth - 1, 10)
}

/**
 * SPT period validation: period must be in YYYY-MM format
 * and month must be 01–12.
 */
export function isValidSptPeriod(period: string): boolean {
  const re = /^\d{4}-(0[1-9]|1[0-2])$/
  return re.test(period)
}

export function sptPeriodToYearMonth(period: string): { year: number; month: number } {
  const [y, m] = period.split('-')
  return { year: parseInt(y, 10), month: parseInt(m, 10) }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaxReportStatus = 'DRAFT' | 'FILED' | 'PAID'

export interface TaxReport {
  id: string
  storeId: string
  type: TaxType
  period: string
  totalTaxable: number
  taxAmount: number
  status: TaxReportStatus
  filedAt: string | null
  dueDate: string
  createdAt: string
  updatedAt: string
}

export interface TaxItem {
  id: string
  reportId: string
  storeId: string
  reference: string
  description: string
  taxableAmount: number
  taxRate: number
  taxAmount: number
  createdAt: string
}

interface TaxReportClientProps {
  storeId: string
  currency: string
}

// ── Nav ───────────────────────────────────────────────────────────────────────

const NAV_TABS = [
  { label: 'Ringkasan',         href: '/dashboard/accounting' },
  { label: 'Chart of Accounts', href: '/dashboard/accounting/chart-of-accounts' },
  { label: 'Jurnal',            href: '/dashboard/accounting/journal' },
  { label: 'Neraca Saldo',      href: '/dashboard/accounting/trial-balance' },
  { label: 'Faktur Supplier',   href: '/dashboard/accounting/supplier-invoices' },
  { label: 'Aset Tetap',        href: '/dashboard/accounting/fixed-assets' },
  { label: 'Faktur B2B',        href: '/dashboard/accounting/invoices' },
  { label: 'e-Faktur',          href: '/dashboard/accounting/e-faktur' },
  { label: 'Laporan Pajak',     href: '/dashboard/accounting/tax-reports' },
]

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
              'px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-2)] hover:bg-[var(--bg-card)] hover:text-[var(--text-1)]',
            )}
          >
            {tab.label}
          </a>
        )
      })}
    </div>
  )
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaxReportStatus, { label: string; color: string; Icon: React.ElementType }> = {
  DRAFT: { label: 'Draft',    color: 'text-slate-600 bg-slate-50 border-slate-200',     Icon: Clock },
  FILED: { label: 'Dilaporkan', color: 'text-blue-600 bg-blue-50 border-blue-200',      Icon: CheckCircle },
  PAID:  { label: 'Dibayar',  color: 'text-emerald-600 bg-emerald-50 border-emerald-200', Icon: CreditCard },
}

const TAX_TYPE_LABEL: Record<TaxType, string> = {
  PPH21: 'PPh 21',
  PPH23: 'PPh 23',
  PPN:   'PPN',
}

const TAX_TYPE_COLOR: Record<TaxType, string> = {
  PPH21: 'text-violet-700 bg-violet-50 border-violet-200',
  PPH23: 'text-blue-700 bg-blue-50 border-blue-200',
  PPN:   'text-amber-700 bg-amber-50 border-amber-200',
}

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

function formatPeriod(period: string): string {
  const [y, m] = period.split('-')
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ reports, currency }: { reports: TaxReport[]; currency: string }) {
  const byType = (t: TaxType) => reports.filter(r => r.type === t)
  const totalTax = (t: TaxType) => byType(t).reduce((s, r) => s + r.taxAmount, 0)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {(['PPH21', 'PPH23', 'PPN'] as TaxType[]).map(type => (
        <div key={type} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs font-medium text-[var(--text-2)] mb-1">{TAX_TYPE_LABEL[type]}</p>
          <p className="text-xl font-bold text-[var(--text-1)]">
            {formatCurrency(totalTax(type), currency)}
          </p>
          <p className="text-xs text-[var(--text-2)] mt-1">
            {byType(type).length} laporan
          </p>
        </div>
      ))}
    </div>
  )
}

// ── New report modal ──────────────────────────────────────────────────────────

interface NewReportForm {
  type: TaxType
  period: string
}

function NewReportModal({
  storeId,
  onClose,
}: {
  storeId: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const now = new Date()
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [form, setForm] = useState<NewReportForm>({
    type: 'PPN',
    period: defaultPeriod,
  })

  const create = useMutation({
    mutationFn: async (data: NewReportForm) => {
      const res = await fetch(`/api/tax-reports?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = (await res.json()) as any
      if (!res.ok) throw new Error(json.error ?? 'Gagal membuat laporan')
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-reports', storeId] })
      toast.success('Laporan pajak dibuat')
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[var(--text-1)]">Buat Laporan Pajak</h2>
          <button onClick={onClose} className="text-[var(--text-2)] hover:text-[var(--text-1)]">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Jenis Pajak</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as TaxType }))}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-page)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="PPH21">PPh 21 — Pajak Penghasilan Karyawan</option>
              <option value="PPH23">PPh 23 — Pemotongan / Withholding</option>
              <option value="PPN">PPN — Pajak Pertambahan Nilai</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1">Periode (YYYY-MM)</label>
            <input
              type="month"
              value={form.period}
              onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-page)] text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-page)]"
          >
            Batal
          </button>
          <button
            onClick={() => create.mutate(form)}
            disabled={create.isPending || !isValidSptPeriod(form.period)}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {create.isPending ? 'Menyimpan…' : 'Buat Laporan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Report row (expandable) ───────────────────────────────────────────────────

function ReportRow({
  report,
  storeId,
  currency,
}: {
  report: TaxReport
  storeId: string
  currency: string
}) {
  const [expanded, setExpanded] = useState(false)
  const qc = useQueryClient()

  const { data: items = [], isFetching } = useQuery<TaxItem[]>({
    queryKey: ['tax-items', report.id],
    queryFn: async () => {
      const res = await fetch(`/api/tax-reports/${report.id}/items?storeId=${storeId}`)
      return (await res.json()) as TaxItem[]
    },
    enabled: expanded,
  })

  const patch = useMutation({
    mutationFn: async (status: TaxReportStatus) => {
      const res = await fetch(`/api/tax-reports/${report.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = (await res.json()) as any
      if (!res.ok) throw new Error(json.error ?? 'Gagal update')
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-reports', storeId] })
      toast.success('Status diperbarui')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleExport = async () => {
    try {
      const res = await fetch(`/api/tax-reports/${report.id}/export?storeId=${storeId}`)
      const json = (await res.json()) as any
      if (!res.ok) throw new Error(json.error ?? 'Export gagal')
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SPT-${report.type}-${report.period}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('SPT berhasil diexport')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const sc = STATUS_CONFIG[report.status]
  const isOverdue = new Date(report.dueDate) < new Date() && report.status === 'DRAFT'

  return (
    <>
      <tr className="hover:bg-[var(--bg-page)] transition-colors">
        <td className="px-4 py-3">
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-[var(--text-2)] hover:text-[var(--text-1)]"
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="px-4 py-3">
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded border', TAX_TYPE_COLOR[report.type])}>
            {TAX_TYPE_LABEL[report.type]}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-[var(--text-1)]">{formatPeriod(report.period)}</td>
        <td className="px-4 py-3 text-sm text-right text-[var(--text-1)]">
          {formatCurrency(report.totalTaxable, currency)}
        </td>
        <td className="px-4 py-3 text-sm text-right font-semibold text-[var(--text-1)]">
          {formatCurrency(report.taxAmount, currency)}
        </td>
        <td className="px-4 py-3">
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded border flex items-center gap-1 w-fit', sc.color)}>
            <sc.Icon size={12} />
            {sc.label}
          </span>
        </td>
        <td className={cn('px-4 py-3 text-xs', isOverdue ? 'text-red-600 font-semibold' : 'text-[var(--text-2)]')}>
          {new Date(report.dueDate).toLocaleDateString('id-ID')}
          {isOverdue && ' ⚠ Jatuh tempo'}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {report.status === 'DRAFT' && (
              <button
                onClick={() => patch.mutate('FILED')}
                disabled={patch.isPending}
                className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50"
              >
                Laporkan
              </button>
            )}
            {report.status === 'FILED' && (
              <button
                onClick={() => patch.mutate('PAID')}
                disabled={patch.isPending}
                className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
              >
                Bayar
              </button>
            )}
            <button
              onClick={handleExport}
              title="Export SPT"
              className="text-xs px-2 py-1 rounded bg-[var(--bg-page)] text-[var(--text-2)] border border-[var(--border)] hover:text-[var(--text-1)]"
            >
              <Download size={13} />
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={8} className="bg-[var(--bg-page)] px-4 pb-4 pt-0">
            {isFetching ? (
              <p className="text-xs text-[var(--text-2)] py-2">Memuat item…</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-[var(--text-2)] py-2">Belum ada item pajak.</p>
            ) : (
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="text-[var(--text-2)]">
                    <th className="text-left pb-1">Referensi</th>
                    <th className="text-left pb-1">Keterangan</th>
                    <th className="text-right pb-1">DPP</th>
                    <th className="text-right pb-1">Tarif</th>
                    <th className="text-right pb-1">Pajak</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-t border-[var(--border)]">
                      <td className="py-1 pr-2 font-mono">{item.reference}</td>
                      <td className="py-1 pr-2">{item.description}</td>
                      <td className="py-1 text-right">{formatCurrency(item.taxableAmount, currency)}</td>
                      <td className="py-1 text-right">{(item.taxRate * 100).toFixed(0)}%</td>
                      <td className="py-1 text-right font-semibold">{formatCurrency(item.taxAmount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TaxReportClient({ storeId, currency }: TaxReportClientProps) {
  const [showNew, setShowNew] = useState(false)
  const [filterType, setFilterType] = useState<TaxType | 'ALL'>('ALL')
  const [filterStatus, setFilterStatus] = useState<TaxReportStatus | 'ALL'>('ALL')

  const { data: reports = [], isFetching, refetch } = useQuery<TaxReport[]>({
    queryKey: ['tax-reports', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/tax-reports?storeId=${storeId}`)
      return (await res.json()) as TaxReport[]
    },
  })

  const filtered = reports.filter(r => {
    if (filterType !== 'ALL' && r.type !== filterType) return false
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false
    return true
  })

  return (
    <div className="space-y-5">
      <SubNav />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="text-[var(--primary)]" size={20} />
          <h1 className="text-xl font-bold text-[var(--text-1)]">Laporan Pajak (SPT)</h1>
          {isFetching && <RefreshCw size={14} className="animate-spin text-[var(--text-2)]" />}
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-[var(--primary)] text-white hover:opacity-90"
        >
          <Plus size={16} />
          Buat Laporan
        </button>
      </div>

      {/* Summary */}
      <SummaryCards reports={reports} currency={currency} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as TaxType | 'ALL')}
          className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--bg-card)] text-[var(--text-1)] focus:outline-none"
        >
          <option value="ALL">Semua Jenis</option>
          <option value="PPH21">PPh 21</option>
          <option value="PPH23">PPh 23</option>
          <option value="PPN">PPN</option>
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as TaxReportStatus | 'ALL')}
          className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--bg-card)] text-[var(--text-1)] focus:outline-none"
        >
          <option value="ALL">Semua Status</option>
          <option value="DRAFT">Draft</option>
          <option value="FILED">Dilaporkan</option>
          <option value="PAID">Dibayar</option>
        </select>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)]"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-2)] text-xs">
                <th className="w-8 px-4 py-3" />
                <th className="text-left px-4 py-3">Jenis</th>
                <th className="text-left px-4 py-3">Periode</th>
                <th className="text-right px-4 py-3">DPP</th>
                <th className="text-right px-4 py-3">Pajak</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Jatuh Tempo</th>
                <th className="text-left px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--text-2)]">
                    Belum ada laporan pajak.
                  </td>
                </tr>
              ) : (
                filtered.map(report => (
                  <ReportRow
                    key={report.id}
                    report={report}
                    storeId={storeId}
                    currency={currency}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && <NewReportModal storeId={storeId} onClose={() => setShowNew(false)} />}
    </div>
  )
}
