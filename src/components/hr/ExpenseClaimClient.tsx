'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, CheckCircle, XCircle, DollarSign, FileText, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExpenseCategory, ExpenseStatus } from '@/lib/expense-claims'

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  TRAVEL: 'Perjalanan',
  MEALS: 'Makan & Minum',
  SUPPLIES: 'Perlengkapan',
  OTHER: 'Lainnya',
}

const STATUS_CONFIG: Record<ExpenseStatus, { label: string; pill: string }> = {
  DRAFT: { label: 'Draft', pill: 'bg-stone-100 text-stone-600 border border-stone-200' },
  SUBMITTED: { label: 'Diajukan', pill: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
  APPROVED: { label: 'Disetujui', pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  REJECTED: { label: 'Ditolak', pill: 'bg-red-50 text-red-600 border border-red-200' },
  PAID: { label: 'Dibayar', pill: 'bg-blue-50 text-blue-700 border border-blue-200' },
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

interface ExpenseClaimClientProps {
  storeId: string
  currency: string
  employees: any[]
  userRole?: string
  currentEmployeeId?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n)
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

// ── New Claim Form Modal ────────────────────────────────────────────────────────

function NewClaimForm({
  storeId,
  employees,
  currentEmployeeId,
  onClose,
  onSaved,
}: {
  storeId: string
  employees: any[]
  currentEmployeeId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    employeeId: currentEmployeeId ?? employees[0]?.id ?? '',
    title: '',
    amount: '',
    category: 'OTHER' as ExpenseCategory,
    receiptUrl: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit() {
    setError('')
    if (!form.title.trim()) return setError('Judul harus diisi')
    const amount = parseFloat(form.amount)
    if (!form.amount || isNaN(amount) || amount <= 0) return setError('Nominal harus lebih dari 0')
    setSaving(true)
    const res = await fetch('/api/hr/expense-claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId,
        employeeId: form.employeeId,
        title: form.title.trim(),
        amount,
        category: form.category,
        receiptUrl: form.receiptUrl.trim() || null,
        notes: form.notes.trim() || null,
      }),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else {
      const d = (await res.json()) as any
      setError(d.error ?? 'Gagal menyimpan')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-[var(--bg-card)] shadow-xl sm:max-w-md sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-bold text-[var(--text-1)]">Ajukan Klaim Biaya</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-muted)]">
            <X className="h-4 w-4 text-[var(--text-2)]" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Karyawan</label>
            <select value={form.employeeId} onChange={set('employeeId')} className={inputCls}>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Judul Klaim</label>
            <input type="text" value={form.title} onChange={set('title')} placeholder="mis. Tiket pesawat ke Jakarta" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Nominal (Rp)</label>
              <input type="number" min={0} value={form.amount} onChange={set('amount')} placeholder="0" className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Kategori</label>
              <select value={form.category} onChange={set('category')} className={inputCls}>
                {(Object.keys(CATEGORY_LABEL) as ExpenseCategory[]).map(c => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">URL Bukti / Nota (opsional)</label>
            <input type="url" value={form.receiptUrl} onChange={set('receiptUrl')} placeholder="https://..." className={inputCls} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Catatan (opsional)</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Keterangan tambahan..." className={cn(inputCls, 'resize-none')} />
          </div>
        </div>
        <div className="flex gap-3 border-t border-[var(--border)] px-5 py-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-muted)]">
            Batal
          </button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
            {saving ? 'Menyimpan...' : 'Simpan Draft'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Reject/Notes Modal ────────────────────────────────────────────────────────

function RejectModal({
  claimId,
  onClose,
  onDone,
}: {
  claimId: string
  onClose: () => void
  onDone: () => void
}) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleReject() {
    setSaving(true)
    await fetch(`/api/hr/expense-claims/${claimId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', role: 'MANAGER', notes }),
    })
    setSaving(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-xl bg-[var(--bg-card)] shadow-xl p-5 space-y-4">
        <h3 className="font-bold text-[var(--text-1)]">Tolak Klaim</h3>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Alasan penolakan (opsional)..."
          className={cn(inputCls, 'resize-none')}
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)]">Batal</button>
          <button onClick={handleReject} disabled={saving} className="flex-1 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">
            {saving ? '...' : 'Tolak'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ExpenseClaimClient({ storeId, currency, employees, userRole = 'STAFF', currentEmployeeId }: ExpenseClaimClientProps) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'claims' | 'summary'>('claims')
  const [summaryMonth, setSummaryMonth] = useState(currentMonth())
  const [bulkLoading, setBulkLoading] = useState(false)

  const canManage = userRole === 'OWNER' || userRole === 'MANAGER'

  const { data: claimsData, isLoading } = useQuery({
    queryKey: ['expense-claims', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/expense-claims?storeId=${storeId}`)
      return (await res.json()) as { data: any[] }
    },
  })

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['expense-claims-summary', storeId, summaryMonth],
    queryFn: async () => {
      const res = await fetch(`/api/hr/expense-claims/summary?storeId=${storeId}&month=${summaryMonth}`)
      return (await res.json()) as { data: any[]; month: string }
    },
    enabled: tab === 'summary',
  })

  const claims: any[] = claimsData?.data ?? []
  const summary: any[] = summaryData?.data ?? []

  async function doAction(id: string, action: string, extra: Record<string, any> = {}) {
    await fetch(`/api/hr/expense-claims/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, role: userRole, ...extra }),
    })
    qc.invalidateQueries({ queryKey: ['expense-claims', storeId] })
    qc.invalidateQueries({ queryKey: ['expense-claims-summary', storeId] })
  }

  async function bulkApprove() {
    if (selected.size === 0) return
    setBulkLoading(true)
    await Promise.all(
      [...selected].map(id =>
        fetch(`/api/hr/expense-claims/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve', role: userRole }),
        }),
      ),
    )
    setSelected(new Set())
    setBulkLoading(false)
    qc.invalidateQueries({ queryKey: ['expense-claims', storeId] })
    qc.invalidateQueries({ queryKey: ['expense-claims-summary', storeId] })
  }

  const submittedClaims = claims.filter(c => c.status === 'SUBMITTED')
  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const toggleSelectAll = () => {
    if (selected.size === submittedClaims.length && submittedClaims.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(submittedClaims.map((c: any) => c.id)))
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-1)]">Klaim Biaya Karyawan</h2>
          <p className="text-sm text-[var(--text-2)]">Pengajuan & penggantian biaya operasional</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
        >
          <Plus className="h-4 w-4" />
          Ajukan Klaim
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-[var(--bg-subtle)] p-1 w-fit">
        {(['claims', 'summary'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-all',
              tab === t
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-2)] hover:text-[var(--text-1)]',
            )}
          >
            {t === 'claims' ? 'Daftar Klaim' : 'Ringkasan Bulanan'}
          </button>
        ))}
      </div>

      {/* Bulk approve bar */}
      {tab === 'claims' && canManage && submittedClaims.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <label className="flex items-center gap-2 text-sm font-medium text-amber-800 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.size === submittedClaims.length && submittedClaims.length > 0}
              onChange={toggleSelectAll}
              className="rounded"
            />
            Pilih semua yang diajukan ({submittedClaims.length})
          </label>
          {selected.size > 0 && (
            <button
              onClick={bulkApprove}
              disabled={bulkLoading}
              className="ml-auto flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              {bulkLoading ? 'Memproses...' : `Setujui ${selected.size} klaim`}
            </button>
          )}
        </div>
      )}

      {/* Claims list */}
      {tab === 'claims' && (
        <div className="space-y-3">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-[var(--text-2)]">Memuat...</p>
          ) : claims.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--border)] py-12">
              <Receipt className="h-8 w-8 text-[var(--text-2)]" />
              <p className="text-sm text-[var(--text-2)]">Belum ada klaim biaya</p>
            </div>
          ) : (
            claims.map((c: any) => {
              const sc = STATUS_CONFIG[c.status as ExpenseStatus] ?? STATUS_CONFIG.DRAFT
              const isSubmitted = c.status === 'SUBMITTED'
              return (
                <div
                  key={c.id}
                  className={cn(
                    'rounded-2xl border bg-[var(--bg-card)] p-4 transition-all',
                    isSubmitted && canManage && selected.has(c.id)
                      ? 'border-amber-400 ring-2 ring-amber-200'
                      : 'border-[var(--border)]',
                  )}
                >
                  <div className="flex items-start gap-3">
                    {canManage && isSubmitted && (
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="mt-1 rounded"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--text-1)] truncate">{c.title}</span>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', sc.pill)}>{sc.label}</span>
                        <span className="rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text-2)]">
                          {CATEGORY_LABEL[c.category as ExpenseCategory] ?? c.category}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-[var(--text-2)]">{c.employeeName ?? c.employeeId}</p>
                      {c.notes && <p className="mt-1 text-xs text-[var(--text-2)] italic">{c.notes}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-[var(--text-1)]">{fmt(c.amount, currency)}</p>
                      <p className="text-xs text-[var(--text-2)]">
                        {c.submittedAt ? new Date(c.submittedAt).toLocaleDateString('id-ID') : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.status === 'DRAFT' && (
                      <button
                        onClick={() => doAction(c.id, 'submit')}
                        className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                      >
                        <FileText className="h-3 w-3" />
                        Ajukan
                      </button>
                    )}
                    {c.status === 'SUBMITTED' && canManage && (
                      <>
                        <button
                          onClick={() => doAction(c.id, 'approve', { approvedBy: 'manager' })}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          <CheckCircle className="h-3 w-3" />
                          Setujui
                        </button>
                        <button
                          onClick={() => setRejectId(c.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
                        >
                          <XCircle className="h-3 w-3" />
                          Tolak
                        </button>
                      </>
                    )}
                    {c.status === 'APPROVED' && canManage && (
                      <button
                        onClick={() => doAction(c.id, 'pay')}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        <DollarSign className="h-3 w-3" />
                        Bayar
                      </button>
                    )}
                    {c.receiptUrl && (
                      <a
                        href={c.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--bg-muted)]"
                      >
                        <Receipt className="h-3 w-3" />
                        Lihat Nota
                      </a>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Summary tab */}
      {tab === 'summary' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={summaryMonth.slice(5, 7)}
              onChange={e => setSummaryMonth(`${summaryMonth.slice(0, 4)}-${e.target.value}`)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
              ))}
            </select>
            <select
              value={summaryMonth.slice(0, 4)}
              onChange={e => setSummaryMonth(`${e.target.value}-${summaryMonth.slice(5, 7)}`)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
            >
              {Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {summaryLoading ? (
            <p className="py-8 text-center text-sm text-[var(--text-2)]">Memuat...</p>
          ) : summary.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-2)]">Tidak ada data untuk bulan ini</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text-2)]">Karyawan</th>
                    <th className="px-4 py-3 text-right font-semibold text-[var(--text-2)]">Jumlah Klaim</th>
                    <th className="px-4 py-3 text-right font-semibold text-[var(--text-2)]">Total</th>
                    <th className="px-4 py-3 text-right font-semibold text-[var(--text-2)]">Sudah Dibayar</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row: any) => (
                    <tr key={row.employeeId} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-subtle)]">
                      <td className="px-4 py-3 font-medium text-[var(--text-1)]">{row.employeeName}</td>
                      <td className="px-4 py-3 text-right text-[var(--text-2)]">{row.claimCount}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--text-1)]">{fmt(row.totalAmount, currency)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-medium">{fmt(row.paidAmount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <NewClaimForm
          storeId={storeId}
          employees={employees}
          currentEmployeeId={currentEmployeeId}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['expense-claims', storeId] })
          }}
        />
      )}
      {rejectId && (
        <RejectModal
          claimId={rejectId}
          onClose={() => setRejectId(null)}
          onDone={() => {
            setRejectId(null)
            qc.invalidateQueries({ queryKey: ['expense-claims', storeId] })
          }}
        />
      )}
    </div>
  )
}
