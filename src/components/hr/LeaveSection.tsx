'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, FileText, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const LEAVE_STATUS_CONFIG = {
  PENDING: { label: 'Menunggu', pill: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
  APPROVED: {
    label: 'Disetujui',
    pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  REJECTED: { label: 'Ditolak', pill: 'bg-red-50 text-red-600 border border-red-200' },
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  ANNUAL: 'Cuti Tahunan',
  SICK: 'Sakit',
  PERSONAL: 'Izin Pribadi',
}

// ── Leave request form modal ───────────────────────────────────────────────────

function LeaveForm({
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
  const [form, setForm] = useState({
    employeeId: employees[0]?.id ?? '',
    startDate: '',
    endDate: '',
    type: 'ANNUAL' as 'ANNUAL' | 'SICK' | 'PERSONAL',
    reason: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit() {
    setError('')
    if (!form.startDate || !form.endDate) return setError('Tanggal harus diisi')
    if (new Date(form.endDate) < new Date(form.startDate))
      return setError('Tanggal selesai tidak boleh sebelum tanggal mulai')
    if (!form.reason.trim() || form.reason.trim().length < 3)
      return setError('Alasan minimal 3 karakter')
    setSaving(true)
    const res = await fetch(`/api/hr/leave?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
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
          <h2 className="font-bold text-[var(--text-1)]">Ajukan Cuti / Izin</h2>
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
              Karyawan
            </label>
            <select value={form.employeeId} onChange={set('employeeId')} className={inputCls}>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                Mulai
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={set('startDate')}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
                Selesai
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={set('endDate')}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">Tipe</label>
            <select value={form.type} onChange={set('type')} className={inputCls}>
              <option value="ANNUAL">Cuti Tahunan</option>
              <option value="SICK">Sakit</option>
              <option value="PERSONAL">Izin Pribadi</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-2)]">
              Alasan
            </label>
            <textarea
              value={form.reason}
              onChange={set('reason')}
              rows={3}
              className={inputCls + ' resize-none'}
              placeholder="Alasan pengajuan cuti…"
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
            {saving ? 'Menyimpan…' : 'Ajukan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── LeaveSection (Cuti & Izin tab) ────────────────────────────────────────────

interface LeaveSectionProps {
  storeId: string
  userRole?: string
  employees: any[]
}

export function LeaveSection({ storeId, userRole, employees }: LeaveSectionProps) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const canApprove = userRole === 'OWNER' || userRole === 'MANAGER'

  const { data: leaves = [], isLoading } = useQuery<any[]>({
    queryKey: ['hr-leave', storeId],
    queryFn: () => fetch(`/api/hr/leave?storeId=${storeId}`).then(r => r.json()),
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/hr/leave/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-leave'] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-3)]">{(leaves as any[]).length} pengajuan</p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Ajukan Cuti
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
          ))}
        </div>
      ) : (leaves as any[]).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-16 shadow-sm">
          <FileText className="mb-3 h-12 w-12 text-stone-200" />
          <p className="text-sm text-[var(--text-3)]">Belum ada pengajuan cuti</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(leaves as any[]).map((leave: any) => {
            const cfg =
              LEAVE_STATUS_CONFIG[leave.status as keyof typeof LEAVE_STATUS_CONFIG] ??
              LEAVE_STATUS_CONFIG.PENDING
            const start = leave.startDate?.slice(0, 10) ?? ''
            const end = leave.endDate?.slice(0, 10) ?? ''
            const days =
              start && end
                ? Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
                : 0
            return (
              <div
                key={leave.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--text-1)]">
                      {leave.employeeName ?? '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-3)]">
                      {LEAVE_TYPE_LABEL[leave.type] ?? leave.type} · {start} – {end} ({days} hari)
                    </p>
                    {leave.reason && (
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-2)]">
                        {leave.reason}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold',
                      cfg.pill,
                    )}
                  >
                    {cfg.label}
                  </span>
                </div>
                {canApprove && leave.status === 'PENDING' && (
                  <div className="mt-3 flex gap-2 border-t border-stone-50 pt-3">
                    <button
                      onClick={() => approveMutation.mutate({ id: leave.id, status: 'APPROVED' })}
                      disabled={approveMutation.isPending}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-50 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <CheckCircle className="h-3 w-3" /> Setujui
                    </button>
                    <button
                      onClick={() => approveMutation.mutate({ id: leave.id, status: 'REJECTED' })}
                      disabled={approveMutation.isPending}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-red-50 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-100"
                    >
                      <XCircle className="h-3 w-3" /> Tolak
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <LeaveForm
          storeId={storeId}
          employees={employees}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['hr-leave'] })
          }}
        />
      )}
    </div>
  )
}
