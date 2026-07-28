'use client'

import { useState, useCallback } from 'react'
import { Plus, X, Calculator, CheckCircle, Banknote, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

type PeriodStatus = 'DRAFT' | 'PROCESSING' | 'APPROVED' | 'DISBURSED'
type EntryStatus = 'PENDING' | 'APPROVED' | 'PAID'

interface PayrollPeriod {
  id: string
  storeId: string
  period: string
  status: PeriodStatus
  totalGross: number
  totalDeductions: number
  totalNet: number
  processedAt?: string
  disbursedAt?: string
  createdAt: string
}

interface Deductions {
  pph21: number
  bpjs: number
  loan: number
  other: number
}

interface PayrollEntry {
  id: string
  periodId: string
  employeeId: string
  employeeName?: string
  employeePosition?: string
  basicSalary: number
  allowances: Record<string, number>
  deductions: Deductions
  grossSalary: number
  netSalary: number
  status: EntryStatus
}

interface PayrollClientProps {
  storeId: string
  currency: string
  initialPeriods: PayrollPeriod[]
}

const PERIOD_STATUS_COLORS: Record<PeriodStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  PROCESSING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  APPROVED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  DISBURSED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
}

const ENTRY_STATUS_COLORS: Record<EntryStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
}

function StatusBadge({ status, colors }: { status: string; colors: Record<string, string> }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', colors[status] ?? 'bg-gray-100 text-gray-700')}>
      {status}
    </span>
  )
}

export default function PayrollClient({ storeId, currency, initialPeriods }: PayrollClientProps) {
  const [periods, setPeriods] = useState<PayrollPeriod[]>(initialPeriods)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [entries, setEntries] = useState<Record<string, PayrollEntry[]>>({})
  const [loadingEntries, setLoadingEntries] = useState<string | null>(null)
  const [calculating, setCalculating] = useState<string | null>(null)
  const [actioning, setActioning] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newPeriod, setNewPeriod] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [saving, setSaving] = useState(false)

  const fmt = useCallback(
    (n: number) => formatCurrency(n, currency),
    [currency],
  )

  const refreshPeriods = useCallback(async () => {
    const res = await fetch(`/api/payroll?storeId=${storeId}`)
    const json = await res.json() as any
    if (!json.error) setPeriods(json.data ?? [])
  }, [storeId])

  const loadEntries = useCallback(async (periodId: string) => {
    if (entries[periodId]) return
    setLoadingEntries(periodId)
    try {
      const res = await fetch(`/api/payroll/${periodId}/entries?storeId=${storeId}`)
      const json = await res.json() as any
      if (!json.error) {
        setEntries(prev => ({
          ...prev,
          [periodId]: (json.data ?? []).map((e: any) => ({
            ...e,
            allowances: typeof e.allowances === 'string' ? JSON.parse(e.allowances) : (e.allowances ?? {}),
            deductions: typeof e.deductions === 'string' ? JSON.parse(e.deductions) : (e.deductions ?? {}),
          })),
        }))
      }
    } finally {
      setLoadingEntries(null)
    }
  }, [storeId, entries])

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      await loadEntries(id)
    }
  }

  const refreshEntries = useCallback(async (periodId: string) => {
    setEntries(prev => { const n = { ...prev }; delete n[periodId]; return n })
    const res = await fetch(`/api/payroll/${periodId}/entries?storeId=${storeId}`)
    const json = await res.json() as any
    if (!json.error) {
      setEntries(prev => ({
        ...prev,
        [periodId]: (json.data ?? []).map((e: any) => ({
          ...e,
          allowances: typeof e.allowances === 'string' ? JSON.parse(e.allowances) : (e.allowances ?? {}),
          deductions: typeof e.deductions === 'string' ? JSON.parse(e.deductions) : (e.deductions ?? {}),
        })),
      }))
    }
  }, [storeId])

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/payroll?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: newPeriod }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success(`Periode ${newPeriod} berhasil dibuat`)
      setShowNewForm(false)
      await refreshPeriods()
    } finally {
      setSaving(false)
    }
  }

  const handleCalculate = async (periodId: string) => {
    setCalculating(periodId)
    try {
      const res = await fetch(`/api/payroll/${periodId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success(`${json.data?.created ?? 0} entri gaji dikalkulasi`)
      await Promise.all([refreshPeriods(), refreshEntries(periodId)])
    } finally {
      setCalculating(null)
    }
  }

  const handleAction = async (periodId: string, action: 'process' | 'approve' | 'disburse') => {
    setActioning(periodId)
    try {
      const res = await fetch(`/api/payroll/${periodId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, action }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      const labels: Record<string, string> = { process: 'diproses', approve: 'disetujui', disburse: 'dicairkan' }
      toast.success(`Payroll berhasil ${labels[action]}`)
      await refreshPeriods()
      if (action === 'disburse') await refreshEntries(periodId)
    } finally {
      setActioning(null)
    }
  }

  // Summary stats
  const totalDisbursed = periods.filter(p => p.status === 'DISBURSED').reduce((s, p) => s + p.totalNet, 0)
  const pendingPeriods = periods.filter(p => p.status !== 'DISBURSED').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Penggajian (Payroll)</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            Kelola periode gaji, hitung PPh 21, BPJS, dan cairkan gaji karyawan
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--primary)' }}
        >
          <Plus className="h-4 w-4" />
          Periode Baru
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Periode', value: periods.length },
          { label: 'Belum Selesai', value: pendingPeriods },
          { label: 'Sudah Dicairkan', value: periods.filter(p => p.status === 'DISBURSED').length },
          { label: 'Total Dicairkan', value: fmt(totalDisbursed) },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl p-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>{label}</p>
            <p className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Periods table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--bg-2)' }}>
            <tr>
              {['Periode', 'Status', 'Total Bruto', 'Potongan', 'Total Bersih', 'Aksi'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-2)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-3)' }}>
                  Belum ada periode penggajian
                </td>
              </tr>
            )}
            {periods.map(period => (
              <>
                <tr
                  key={period.id}
                  className="border-t cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                  onClick={() => toggleExpand(period.id)}
                >
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-1)' }}>
                    <div className="flex items-center gap-2">
                      {expandedId === period.id
                        ? <ChevronUp className="h-4 w-4" style={{ color: 'var(--text-3)' }} />
                        : <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-3)' }} />
                      }
                      {period.period}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={period.status} colors={PERIOD_STATUS_COLORS} />
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-1)' }}>{fmt(period.totalGross)}</td>
                  <td className="px-4 py-3 text-red-500">-{fmt(period.totalDeductions)}</td>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-1)' }}>{fmt(period.totalNet)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      {/* Calculate button — available unless DISBURSED */}
                      {period.status !== 'DISBURSED' && (
                        <button
                          onClick={() => handleCalculate(period.id)}
                          disabled={calculating === period.id}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                          title="Hitung otomatis dari data karyawan"
                        >
                          {calculating === period.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Calculator className="h-3 w-3" />
                          }
                          Hitung
                        </button>
                      )}
                      {/* Status-specific action buttons */}
                      {period.status === 'DRAFT' && (
                        <button
                          onClick={() => handleAction(period.id, 'process')}
                          disabled={actioning === period.id}
                          className="rounded px-2 py-1 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
                        >
                          Proses
                        </button>
                      )}
                      {period.status === 'PROCESSING' && (
                        <button
                          onClick={() => handleAction(period.id, 'approve')}
                          disabled={actioning === period.id}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                        >
                          <CheckCircle className="h-3 w-3" />
                          Setujui
                        </button>
                      )}
                      {period.status === 'APPROVED' && (
                        <button
                          onClick={() => handleAction(period.id, 'disburse')}
                          disabled={actioning === period.id}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                        >
                          <Banknote className="h-3 w-3" />
                          Cairkan
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded entries */}
                {expandedId === period.id && (
                  <tr key={`${period.id}-entries`} style={{ background: 'var(--bg-1)' }}>
                    <td colSpan={6} className="px-6 py-4">
                      {loadingEntries === period.id ? (
                        <div className="flex items-center gap-2 py-4" style={{ color: 'var(--text-3)' }}>
                          <Loader2 className="h-4 w-4 animate-spin" /> Memuat data gaji...
                        </div>
                      ) : !entries[period.id] || entries[period.id].length === 0 ? (
                        <p className="text-sm py-2" style={{ color: 'var(--text-3)' }}>
                          Belum ada entri gaji. Klik tombol <strong>Hitung</strong> untuk kalkulasi otomatis.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr style={{ color: 'var(--text-3)' }}>
                                {['Karyawan', 'Gaji Pokok', 'Bruto', 'PPh 21', 'BPJS', 'Cicilan', 'Gaji Bersih', 'Status'].map(h => (
                                  <th key={h} className="text-left pb-2 pr-4 font-medium">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(entries[period.id] ?? []).map(entry => (
                                <tr key={entry.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                                  <td className="py-2 pr-4 font-medium" style={{ color: 'var(--text-1)' }}>
                                    {entry.employeeName ?? entry.employeeId}
                                    {entry.employeePosition && (
                                      <span className="ml-1 text-xs" style={{ color: 'var(--text-3)' }}>
                                        · {entry.employeePosition}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 pr-4" style={{ color: 'var(--text-2)' }}>{fmt(entry.basicSalary)}</td>
                                  <td className="py-2 pr-4 font-medium" style={{ color: 'var(--text-1)' }}>{fmt(entry.grossSalary)}</td>
                                  <td className="py-2 pr-4 text-red-500">-{fmt(entry.deductions?.pph21 ?? 0)}</td>
                                  <td className="py-2 pr-4 text-red-500">-{fmt(entry.deductions?.bpjs ?? 0)}</td>
                                  <td className="py-2 pr-4 text-red-500">-{fmt(entry.deductions?.loan ?? 0)}</td>
                                  <td className="py-2 pr-4 font-semibold text-green-600">{fmt(entry.netSalary)}</td>
                                  <td className="py-2">
                                    <StatusBadge status={entry.status} colors={ENTRY_STATUS_COLORS} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
                                <td className="py-2 pr-4 font-semibold" style={{ color: 'var(--text-2)' }}>Total</td>
                                <td />
                                <td className="py-2 pr-4 font-semibold" style={{ color: 'var(--text-1)' }}>
                                  {fmt((entries[period.id] ?? []).reduce((s, e) => s + e.grossSalary, 0))}
                                </td>
                                <td className="py-2 pr-4 text-red-500">
                                  -{fmt((entries[period.id] ?? []).reduce((s, e) => s + (e.deductions?.pph21 ?? 0), 0))}
                                </td>
                                <td className="py-2 pr-4 text-red-500">
                                  -{fmt((entries[period.id] ?? []).reduce((s, e) => s + (e.deductions?.bpjs ?? 0), 0))}
                                </td>
                                <td className="py-2 pr-4 text-red-500">
                                  -{fmt((entries[period.id] ?? []).reduce((s, e) => s + (e.deductions?.loan ?? 0), 0))}
                                </td>
                                <td className="py-2 pr-4 font-bold text-green-600">
                                  {fmt((entries[period.id] ?? []).reduce((s, e) => s + e.netSalary, 0))}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* New period modal */}
      {showNewForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>Buat Periode Penggajian</h2>
              <button onClick={() => setShowNewForm(false)} style={{ color: 'var(--text-3)' }}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePeriod} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                  Periode (YYYY-MM)
                </label>
                <input
                  type="month"
                  required
                  value={newPeriod}
                  onChange={e => setNewPeriod(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="flex-1 rounded-lg px-4 py-2 text-sm font-medium"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--primary)' }}
                >
                  {saving ? 'Menyimpan…' : 'Buat Periode'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
