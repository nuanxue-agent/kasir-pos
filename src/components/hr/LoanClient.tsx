'use client'

import { useState, useCallback } from 'react'
import { Plus, X, ChevronDown, ChevronUp, Loader2, CheckCircle, XCircle, Clock, DollarSign, CreditCard, AlertTriangle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { calcInstallmentAmount, calcRemainingBalance, calcTotalInterest, isRepaymentOverdue, calcPayrollDeduction } from '@/lib/loans'

export { calcInstallmentAmount, calcRemainingBalance, calcTotalInterest, isRepaymentOverdue, calcPayrollDeduction }

type LoanType = 'LOAN' | 'ADVANCE'
type LoanStatus = 'PENDING' | 'APPROVED' | 'ACTIVE' | 'PAID' | 'REJECTED'
type RepaymentStatus = 'PENDING' | 'PAID' | 'OVERDUE'

interface Loan {
  id: string
  employeeId: string
  employeeName?: string
  type: LoanType
  amount: number
  interestRate: number
  installments: number
  installmentAmount: number
  status: LoanStatus
  approvedBy?: string
  approvedAt?: string
  startDate?: string
  createdAt: string
}

interface Repayment {
  id: string
  loanId: string
  amount: number
  dueDate: string
  paidAt?: string
  status: RepaymentStatus
}

interface Employee {
  id: string
  name: string
  baseSalary?: number
}

interface LoanClientProps {
  storeId: string
  currency: string
  initialLoans: Loan[]
  employees: Employee[]
}

const STATUS_COLORS: Record<LoanStatus, string> = {
  PENDING:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ACTIVE:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  PAID:     'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

const REP_STATUS_COLORS: Record<RepaymentStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  PAID:    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  OVERDUE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

function StatusBadge({ status }: { status: LoanStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[status])}>
      {status}
    </span>
  )
}

function RepStatusBadge({ status }: { status: RepaymentStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', REP_STATUS_COLORS[status])}>
      {status}
    </span>
  )
}

export default function LoanClient({ storeId, currency, initialLoans, employees }: LoanClientProps) {
  const [loans, setLoans] = useState<Loan[]>(initialLoans)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [repayments, setRepayments] = useState<Record<string, Repayment[]>>({})
  const [loadingRep, setLoadingRep] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    employeeId: '',
    type: 'LOAN' as LoanType,
    amount: '',
    interestRate: '0',
    installments: '12',
    startDate: '',
  })

  const previewInstallment =
    form.amount && Number(form.amount) > 0 && Number(form.installments) >= 1
      ? calcInstallmentAmount(Number(form.amount), Number(form.interestRate), Number(form.installments))
      : null

  const previewInterest =
    form.amount && Number(form.amount) > 0 && Number(form.installments) >= 1
      ? calcTotalInterest(Number(form.amount), Number(form.interestRate), Number(form.installments))
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/hr/loans?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: form.employeeId,
          type: form.type,
          amount: Number(form.amount),
          interestRate: Number(form.interestRate),
          installments: Number(form.installments),
          startDate: form.startDate || null,
        }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Loan application submitted')
      setShowForm(false)
      setForm({ employeeId: '', type: 'LOAN', amount: '', interestRate: '0', installments: '12', startDate: '' })
      await refreshLoans()
    } finally {
      setSaving(false)
    }
  }

  const refreshLoans = useCallback(async () => {
    const res = await fetch(`/api/hr/loans?storeId=${storeId}`)
    const json = await res.json() as any
    if (!json.error) setLoans(json.data ?? [])
  }, [storeId])

  const handleAction = async (id: string, action: string, extra?: Record<string, unknown>) => {
    const res = await fetch(`/api/hr/loans/${id}?storeId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success(`Loan ${action}d`)
    await refreshLoans()
  }

  const loadRepayments = async (loanId: string) => {
    if (repayments[loanId]) return
    setLoadingRep(loanId)
    try {
      const res = await fetch(`/api/hr/loans/${loanId}/repayments?storeId=${storeId}`)
      const json = await res.json() as any
      if (!json.error) setRepayments(prev => ({ ...prev, [loanId]: json.data ?? [] }))
    } finally {
      setLoadingRep(null)
    }
  }

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      await loadRepayments(id)
    }
  }

  const markRepaymentPaid = async (loanId: string, repaymentId: string) => {
    const res = await fetch(`/api/hr/loans/${loanId}/repayments/${repaymentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success('Repayment marked as paid')
    // Refresh repayments and loans
    setRepayments(prev => ({ ...prev, [loanId]: [] }))
    await Promise.all([loadRepayments(loanId), refreshLoans()])
    // Re-trigger fetch so cache busts
    setRepayments(prev => { const n = { ...prev }; delete n[loanId]; return n })
    await loadRepayments(loanId)
  }

  const activeLoans = loans.filter(l => l.status === 'ACTIVE')
  const totalDeductions = employees.reduce((sum, emp) => {
    return sum + calcPayrollDeduction(
      activeLoans.map(l => ({ employeeId: l.employeeId, status: l.status, installmentAmount: l.installmentAmount })),
      emp.id,
    )
  }, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Pinjaman Karyawan</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            Kelola pinjaman dan uang muka gaji karyawan
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--primary)' }}
        >
          <Plus className="h-4 w-4" />
          Ajukan Pinjaman
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Pinjaman', value: loans.length, icon: CreditCard },
          { label: 'Aktif', value: loans.filter(l => l.status === 'ACTIVE').length, icon: CheckCircle },
          { label: 'Menunggu', value: loans.filter(l => l.status === 'PENDING').length, icon: Clock },
          { label: 'Potongan/Bulan', value: formatCurrency(totalDeductions, currency), icon: DollarSign },
        ].map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl p-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className="h-4 w-4" style={{ color: 'var(--primary)' }} />
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>{label}</span>
            </div>
            <p className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Loan list */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--bg-2)' }}>
            <tr>
              {['Karyawan', 'Tipe', 'Jumlah', 'Cicilan/Bulan', 'Angsuran', 'Status', 'Aksi'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-2)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loans.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--text-3)' }}>
                  Belum ada data pinjaman
                </td>
              </tr>
            )}
            {loans.map(loan => (
              <>
                <tr
                  key={loan.id}
                  className="border-t cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
                  onClick={() => toggleExpand(loan.id)}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-1)' }}>
                    {loan.employeeName ?? loan.employeeId}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      loan.type === 'ADVANCE'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                    )}>
                      {loan.type === 'ADVANCE' ? 'Uang Muka' : 'Pinjaman'}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-1)' }}>
                    {formatCurrency(loan.amount, currency)}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-1)' }}>
                    {formatCurrency(loan.installmentAmount, currency)}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>
                    {loan.installments}x
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={loan.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      {loan.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => handleAction(loan.id, 'approve')}
                            className="rounded px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700"
                          >
                            Setuju
                          </button>
                          <button
                            onClick={() => handleAction(loan.id, 'reject')}
                            className="rounded px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700"
                          >
                            Tolak
                          </button>
                        </>
                      )}
                      {loan.status === 'APPROVED' && (
                        <button
                          onClick={() => handleAction(loan.id, 'activate', { startDate: loan.startDate ?? new Date().toISOString().split('T')[0] })}
                          className="rounded px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700"
                        >
                          Aktifkan
                        </button>
                      )}
                      <button className="p-1 rounded hover:opacity-70" style={{ color: 'var(--text-3)' }}>
                        {expandedId === loan.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === loan.id && (
                  <tr key={`${loan.id}-detail`} style={{ background: 'var(--bg-1)' }}>
                    <td colSpan={7} className="px-6 py-4">
                      {loadingRep === loan.id ? (
                        <div className="flex items-center gap-2" style={{ color: 'var(--text-3)' }}>
                          <Loader2 className="h-4 w-4 animate-spin" /> Memuat jadwal cicilan...
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'var(--text-2)' }}>
                            <span>Bunga: {loan.interestRate}% / thn</span>
                            {loan.startDate && <span>Mulai: {loan.startDate}</span>}
                            {loan.approvedBy && <span>Disetujui oleh: {loan.approvedBy}</span>}
                            {loan.status === 'ACTIVE' && (
                              <span className="font-medium" style={{ color: 'var(--text-1)' }}>
                                Sisa saldo: {formatCurrency(
                                  calcRemainingBalance(
                                    loan.amount,
                                    loan.interestRate,
                                    loan.installments,
                                    (repayments[loan.id] ?? []).filter(r => r.status === 'PAID').length,
                                  ),
                                  currency,
                                )}
                              </span>
                            )}
                          </div>

                          {(repayments[loan.id] ?? []).length === 0 ? (
                            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                              {loan.status === 'ACTIVE' ? 'Tidak ada jadwal cicilan' : 'Jadwal cicilan tersedia setelah diaktifkan'}
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr style={{ color: 'var(--text-3)' }}>
                                    <th className="text-left pb-2 pr-4">#</th>
                                    <th className="text-left pb-2 pr-4">Jatuh Tempo</th>
                                    <th className="text-left pb-2 pr-4">Jumlah</th>
                                    <th className="text-left pb-2 pr-4">Status</th>
                                    <th className="text-left pb-2 pr-4">Dibayar</th>
                                    <th className="text-left pb-2"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(repayments[loan.id] ?? []).map((rep, idx) => {
                                    const overdueStatus = isRepaymentOverdue(rep)
                                      ? 'OVERDUE' as RepaymentStatus
                                      : rep.status as RepaymentStatus
                                    return (
                                      <tr key={rep.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                                        <td className="py-2 pr-4" style={{ color: 'var(--text-3)' }}>{idx + 1}</td>
                                        <td className="py-2 pr-4" style={{ color: 'var(--text-1)' }}>{rep.dueDate}</td>
                                        <td className="py-2 pr-4" style={{ color: 'var(--text-1)' }}>
                                          {formatCurrency(rep.amount, currency)}
                                        </td>
                                        <td className="py-2 pr-4">
                                          <RepStatusBadge status={overdueStatus} />
                                        </td>
                                        <td className="py-2 pr-4" style={{ color: 'var(--text-3)' }}>
                                          {rep.paidAt ?? '—'}
                                        </td>
                                        <td className="py-2">
                                          {rep.status !== 'PAID' && (
                                            <button
                                              onClick={() => markRepaymentPaid(loan.id, rep.id)}
                                              className="rounded px-2 py-0.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700"
                                            >
                                              Bayar
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
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

      {/* New loan modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-lg rounded-2xl p-6 shadow-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>Ajukan Pinjaman Baru</h2>
              <button onClick={() => setShowForm(false)} style={{ color: 'var(--text-3)' }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Karyawan</label>
                <select
                  required
                  value={form.employeeId}
                  onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                >
                  <option value="">Pilih karyawan...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Tipe</label>
                  <select
                    value={form.type}
                    onChange={e => {
                      const t = e.target.value as LoanType
                      setForm(f => ({ ...f, type: t, interestRate: t === 'ADVANCE' ? '0' : f.interestRate }))
                    }}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  >
                    <option value="LOAN">Pinjaman</option>
                    <option value="ADVANCE">Uang Muka Gaji</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Jumlah (Rp)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                    Bunga / thn (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    disabled={form.type === 'ADVANCE'}
                    value={form.interestRate}
                    onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                    style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Jumlah Cicilan</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={60}
                    value={form.installments}
                    onChange={e => setForm(f => ({ ...f, installments: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Tanggal Mulai (opsional)</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                />
              </div>

              {/* Preview */}
              {previewInstallment !== null && (
                <div
                  className="rounded-lg p-3 space-y-1"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
                >
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-2)' }}>Cicilan per bulan</span>
                    <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
                      {formatCurrency(previewInstallment, currency)}
                    </span>
                  </div>
                  {previewInterest !== null && previewInterest > 0 && (
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text-2)' }}>Total bunga</span>
                      <span className="font-medium" style={{ color: 'var(--text-3)' }}>
                        {formatCurrency(previewInterest, currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-2)' }}>Total bayar</span>
                    <span className="font-semibold" style={{ color: 'var(--primary)' }}>
                      {formatCurrency(previewInstallment * Number(form.installments), currency)}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium"
                  style={{ background: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--primary)' }}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Ajukan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
