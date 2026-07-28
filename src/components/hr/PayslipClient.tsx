'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  Printer,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const STATUS_PILL: Record<string, string> = {
  DRAFT: 'bg-stone-100 text-stone-600 border border-stone-200',
  ISSUED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

// ── Payslip print layout ───────────────────────────────────────────────────────

function PayslipPrintView({
  payslip,
  currency,
  onClose,
}: {
  payslip: any
  currency: string
  onClose: () => void
}) {
  const allowances: Record<string, number> =
    typeof payslip.allowances === 'string'
      ? JSON.parse(payslip.allowances)
      : (payslip.allowances ?? {})
  const deductions: Record<string, number> =
    typeof payslip.deductions === 'string'
      ? JSON.parse(payslip.deductions)
      : (payslip.deductions ?? {})

  const totalAllowances = Object.values(allowances).reduce((s, v) => s + v, 0)
  const totalDeductions = Object.values(deductions).reduce((s, v) => s + v, 0)
  const fmt = (n: number) => formatCurrency(n, currency)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:bg-white print:p-0">
      {/* Print-ready card */}
      <div
        id="payslip-print"
        className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl print:max-w-none print:rounded-none print:shadow-none"
      >
        {/* Header */}
        <div className="mb-6 border-b border-stone-200 pb-4">
          <h2 className="text-xl font-bold text-stone-800">SLIP GAJI</h2>
          <p className="text-sm text-stone-500">Periode: {payslip.period}</p>
          {payslip.issuedAt && (
            <p className="text-xs text-stone-400">
              Diterbitkan: {new Date(payslip.issuedAt).toLocaleDateString('id-ID')}
            </p>
          )}
        </div>

        {/* Employee info */}
        <div className="mb-5 grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-stone-400">Nama Karyawan</p>
            <p className="font-semibold text-stone-800">{payslip.employeeName ?? payslip.employeeId}</p>
          </div>
          <div>
            <p className="text-xs text-stone-400">Jabatan</p>
            <p className="font-semibold text-stone-800">{payslip.position ?? '—'}</p>
          </div>
        </div>

        {/* Pay breakdown */}
        <table className="mb-4 w-full text-sm">
          <tbody>
            <tr className="border-b border-stone-100">
              <td className="py-2 text-stone-600">Gaji Pokok</td>
              <td className="py-2 text-right font-medium text-stone-800">{fmt(payslip.basicPay ?? 0)}</td>
            </tr>
            {Object.entries(allowances).map(([k, v]) => (
              <tr key={k} className="border-b border-stone-50">
                <td className="py-1.5 pl-4 text-stone-500">{k}</td>
                <td className="py-1.5 text-right text-emerald-600">+{fmt(v)}</td>
              </tr>
            ))}
            {totalAllowances > 0 && (
              <tr className="border-b border-stone-100 bg-emerald-50/50">
                <td className="py-2 font-medium text-stone-700">Total Tunjangan</td>
                <td className="py-2 text-right font-medium text-emerald-700">+{fmt(totalAllowances)}</td>
              </tr>
            )}
            {Object.entries(deductions).map(([k, v]) => (
              <tr key={k} className="border-b border-stone-50">
                <td className="py-1.5 pl-4 text-stone-500">{k}</td>
                <td className="py-1.5 text-right text-red-500">-{fmt(v)}</td>
              </tr>
            ))}
            {totalDeductions > 0 && (
              <tr className="border-b border-stone-200 bg-red-50/50">
                <td className="py-2 font-medium text-stone-700">Total Potongan</td>
                <td className="py-2 text-right font-medium text-red-600">-{fmt(totalDeductions)}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-amber-50">
              <td className="rounded-l-lg py-3 pl-3 text-base font-bold text-stone-800">
                GAJI BERSIH
              </td>
              <td className="rounded-r-lg py-3 pr-3 text-right text-base font-bold text-amber-700">
                {fmt(payslip.netPay ?? 0)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="text-center text-xs text-stone-400">
          Dokumen ini diterbitkan secara digital dan sah tanpa tanda tangan.
        </p>
      </div>

      {/* Actions — hidden in print */}
      <div className="absolute bottom-6 right-6 flex gap-2 print:hidden">
        <button
          onClick={onClose}
          className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-stone-600 shadow transition hover:bg-stone-50"
        >
          Tutup
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-amber-600"
        >
          <Printer className="h-4 w-4" />
          Cetak
        </button>
      </div>
    </div>
  )
}

// ── Create payslip modal ───────────────────────────────────────────────────────

function CreatePayslipModal({
  storeId,
  employees,
  onClose,
  onSaved,
}: {
  storeId: string
  employees: any[]
  onClose: () => void
  onSaved: () => void
}) {
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const [form, setForm] = useState({
    employeeId: employees[0]?.id ?? '',
    period: currentMonth,
    basicPay: '',
    allowances: '{"Tunjangan Transport": 0}',
    deductions: '{"BPJS Kesehatan": 0}',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit() {
    setError('')
    if (!form.employeeId || !form.period || !form.basicPay)
      return setError('Isi semua field wajib')
    let allowances: Record<string, number>
    let deductions: Record<string, number>
    try {
      allowances = JSON.parse(form.allowances)
      deductions = JSON.parse(form.deductions)
    } catch {
      return setError('Format JSON tunjangan/potongan tidak valid')
    }
    setSaving(true)
    try {
      const res = await fetch('/api/hr/payslips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          employeeId: form.employeeId,
          period: form.period,
          basicPay: Number(form.basicPay),
          allowances,
          deductions,
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? 'Gagal membuat slip gaji')
      }
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] p-6 shadow-xl">
        <h3 className="mb-4 text-base font-semibold text-[var(--text-1)]">Buat Slip Gaji</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Karyawan</label>
            <select value={form.employeeId} onChange={set('employeeId')} className={inputCls}>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
              Periode (YYYY-MM)
            </label>
            <input type="month" value={form.period} onChange={set('period')} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Gaji Pokok</label>
            <input
              type="number"
              min="0"
              value={form.basicPay}
              onChange={set('basicPay')}
              className={inputCls}
              placeholder="5000000"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
              Tunjangan (JSON)
            </label>
            <textarea
              value={form.allowances}
              onChange={set('allowances')}
              rows={2}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
              Potongan (JSON)
            </label>
            <textarea
              value={form.deductions}
              onChange={set('deductions')}
              rows={2}
              className={inputCls}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--bg-subtle)]"
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface PayslipClientProps {
  storeId: string
  currency?: string
  userRole?: string
}

export default function PayslipClient({ storeId, currency = 'IDR', userRole }: PayslipClientProps) {
  const qc = useQueryClient()
  const [period, setPeriod] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  )
  const [showCreate, setShowCreate] = useState(false)
  const [printPayslip, setPrintPayslip] = useState<any | null>(null)
  const [bulkIssuing, setBulkIssuing] = useState(false)

  const isManager = userRole === 'OWNER' || userRole === 'MANAGER' || userRole === 'ADMIN'

  // Fetch payslips for the selected period
  const { data: payslips = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['payslips', storeId, period],
    queryFn: async () => {
      const res = await fetch(`/api/hr/payslips?storeId=${storeId}&period=${period}`)
      if (!res.ok) throw new Error('Gagal memuat slip gaji')
      return res.json()
    },
  })

  // Fetch employees (for create form)
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/employees?storeId=${storeId}`)
      if (!res.ok) return []
      return res.json()
    },
    enabled: isManager,
  })

  const issueMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hr/payslips/${id}/issue`, { method: 'PATCH' })
      if (!res.ok) throw new Error('Gagal menerbitkan slip gaji')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payslips', storeId, period] }),
  })

  async function bulkIssue() {
    const drafts = payslips.filter((p: any) => p.status === 'DRAFT')
    if (drafts.length === 0) return
    setBulkIssuing(true)
    try {
      await Promise.all(drafts.map((p: any) => issueMutation.mutateAsync(p.id)))
    } finally {
      setBulkIssuing(false)
    }
  }

  const draftCount = payslips.filter((p: any) => p.status === 'DRAFT').length
  const issuedCount = payslips.filter((p: any) => p.status === 'ISSUED').length
  const totalNet = payslips.reduce((s: number, p: any) => s + (p.netPay ?? 0), 0)

  const [monthStr, yearStr] = [
    MONTH_NAMES[(parseInt(period.split('-')[1]) || 1) - 1],
    period.split('-')[0],
  ]

  return (
    <div className="space-y-5 px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-1)]">Slip Gaji</h1>
          <p className="text-xs text-[var(--text-2)]">
            {monthStr} {yearStr} · {payslips.length} slip
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30"
          />
          {isManager && (
            <>
              {draftCount > 0 && (
                <button
                  onClick={bulkIssue}
                  disabled={bulkIssuing}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {bulkIssuing ? 'Menerbitkan...' : `Terbitkan Semua (${draftCount})`}
                </button>
              )}
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
              >
                <Plus className="h-4 w-4" />
                Buat Slip
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
          <p className="text-xs text-[var(--text-2)]">Total Slip</p>
          <p className="text-2xl font-bold text-[var(--text-1)]">{payslips.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
          <p className="text-xs text-[var(--text-2)]">Diterbitkan</p>
          <p className="text-2xl font-bold text-emerald-600">{issuedCount}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
          <p className="text-xs text-[var(--text-2)]">Total Gaji Bersih</p>
          <p className="text-base font-bold text-amber-600">{formatCurrency(totalNet, currency)}</p>
        </div>
      </div>

      {/* Table / list */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" />
        </div>
      ) : payslips.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-10 text-center text-sm text-[var(--text-2)]">
          Belum ada slip gaji untuk periode ini.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                <th className="px-4 py-3 text-left font-semibold text-[var(--text-2)]">Karyawan</th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--text-2)]">Gaji Pokok</th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--text-2)]">Tunjangan</th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--text-2)]">Potongan</th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--text-2)]">Gaji Bersih</th>
                <th className="px-4 py-3 text-center font-semibold text-[var(--text-2)]">Status</th>
                <th className="px-4 py-3 text-center font-semibold text-[var(--text-2)]">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {payslips.map((p: any) => {
                const allowances: Record<string, number> =
                  typeof p.allowances === 'string'
                    ? JSON.parse(p.allowances)
                    : (p.allowances ?? {})
                const deductions: Record<string, number> =
                  typeof p.deductions === 'string'
                    ? JSON.parse(p.deductions)
                    : (p.deductions ?? {})
                const totalAllow = Object.values(allowances).reduce((s, v) => s + v, 0)
                const totalDeduct = Object.values(deductions).reduce((s, v) => s + v, 0)
                return (
                  <tr key={p.id} className="transition hover:bg-[var(--bg-subtle)]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--text-1)]">
                        {p.employeeName ?? p.employeeId}
                      </p>
                      {p.position && (
                        <p className="text-xs text-[var(--text-2)]">{p.position}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-1)]">
                      {formatCurrency(p.basicPay ?? 0, currency)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600">
                      +{formatCurrency(totalAllow, currency)}
                    </td>
                    <td className="px-4 py-3 text-right text-red-500">
                      -{formatCurrency(totalDeduct, currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-amber-600">
                      {formatCurrency(p.netPay ?? 0, currency)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_PILL[p.status] ?? 'bg-stone-100 text-stone-600',
                        )}
                      >
                        {p.status === 'ISSUED' ? 'Diterbitkan' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setPrintPayslip(p)}
                          title="Lihat / Cetak"
                          className="rounded-lg p-1.5 text-[var(--text-2)] transition hover:bg-[var(--bg-subtle)] hover:text-amber-600"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        {isManager && p.status === 'DRAFT' && (
                          <button
                            onClick={() => issueMutation.mutate(p.id)}
                            title="Terbitkan"
                            className="rounded-lg p-1.5 text-[var(--text-2)] transition hover:bg-[var(--bg-subtle)] hover:text-emerald-600"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreatePayslipModal
          storeId={storeId}
          employees={employees}
          onClose={() => setShowCreate(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['payslips', storeId, period] })}
        />
      )}

      {printPayslip && (
        <PayslipPrintView
          payslip={printPayslip}
          currency={currency}
          onClose={() => setPrintPayslip(null)}
        />
      )}
    </div>
  )
}
