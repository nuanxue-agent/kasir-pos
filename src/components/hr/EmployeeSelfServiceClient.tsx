'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User,
  FileText,
  Calendar,
  Clock,
  Star,
  BookOpen,
  Plus,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const LEAVE_TYPE_LABEL: Record<string, string> = {
  ANNUAL: 'Cuti Tahunan',
  SICK: 'Sakit',
  PERSONAL: 'Izin Pribadi',
}

const STATUS_PILL: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  REJECTED: 'bg-red-50 text-red-600 border border-red-200',
  SCHEDULED: 'bg-blue-50 text-blue-700 border border-blue-200',
  DRAFT: 'bg-stone-100 text-stone-600 border border-stone-200',
  ISSUED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
}

// ── Leave request form ─────────────────────────────────────────────────────────

function LeaveRequestForm({
  storeId,
  employeeId,
  onClose,
  onSaved,
}: {
  storeId: string
  employeeId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
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
    try {
      const res = await fetch('/api/hr/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, employeeId, ...form }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? 'Gagal mengajukan cuti')
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
        <h3 className="mb-4 text-base font-semibold text-[var(--text-1)]">Ajukan Cuti</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
              Jenis Cuti
            </label>
            <select value={form.type} onChange={set('type')} className={inputCls}>
              <option value="ANNUAL">Cuti Tahunan</option>
              <option value="SICK">Sakit</option>
              <option value="PERSONAL">Izin Pribadi</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
                Tanggal Mulai
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={set('startDate')}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
                Tanggal Selesai
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
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Alasan</label>
            <textarea
              value={form.reason}
              onChange={set('reason')}
              rows={3}
              className={inputCls}
              placeholder="Jelaskan alasan cuti..."
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
              {saving ? 'Menyimpan...' : 'Ajukan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Shift acknowledgement row ──────────────────────────────────────────────────

function ShiftRow({ shift, onAck }: { shift: any; onAck: (id: string) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-[var(--text-1)]">
          {shift.date} · {shift.startTime}–{shift.endTime}
        </p>
        <p className="text-xs text-[var(--text-2)]">{shift.role}</p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            STATUS_PILL[shift.status] ?? 'bg-stone-100 text-stone-600',
          )}
        >
          {shift.status}
        </span>
        {shift.status === 'SCHEDULED' && (
          <button
            onClick={() => onAck(shift.id)}
            className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-600"
          >
            Konfirmasi
          </button>
        )}
        {shift.status === 'CONFIRMED' && (
          <CheckCircle className="h-4 w-4 text-emerald-500" />
        )}
      </div>
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color = 'amber',
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  color?: 'amber' | 'blue' | 'emerald' | 'purple'
}) {
  const colorMap = {
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className={cn('rounded-xl p-2.5', colorMap[color])}>{icon}</div>
      <div>
        <p className="text-xs text-[var(--text-2)]">{label}</p>
        <p className="text-lg font-bold text-[var(--text-1)]">{value}</p>
        {sub && <p className="text-xs text-[var(--text-2)]">{sub}</p>}
      </div>
    </div>
  )
}

// ── Section accordion ──────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
          {icon}
          {title}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-[var(--text-2)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--text-2)]" />
        )}
      </button>
      {open && <div className="border-t border-[var(--border)] px-5 py-4">{children}</div>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface EmployeeSelfServiceClientProps {
  storeId: string
  employeeId: string
  currency?: string
}

export default function EmployeeSelfServiceClient({
  storeId,
  employeeId,
  currency = 'IDR',
}: EmployeeSelfServiceClientProps) {
  const qc = useQueryClient()
  const [showLeaveForm, setShowLeaveForm] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['self-service', employeeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/self-service/${employeeId}?storeId=${storeId}`)
      if (!res.ok) throw new Error('Gagal memuat data')
      return res.json() as Promise<{
        employee: any
        payslips: any[]
        shifts: any[]
        leaveBalance: number
        pendingLeaves: any[]
        performanceScores: any[]
        trainingStatus: any[]
        lastLogin: string | null
        notifPrefs: any
      }>
    },
  })

  const ackMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      const res = await fetch(`/api/hr/shifts/${shiftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CONFIRMED' }),
      })
      if (!res.ok) throw new Error('Gagal konfirmasi shift')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['self-service', employeeId] }),
  })

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
        Gagal memuat data self-service. Silakan coba lagi.
      </div>
    )
  }

  const emp = data.employee
  const upcomingShifts = (data.shifts ?? []).filter(
    s => new Date(s.date) >= new Date(new Date().toISOString().slice(0, 10)),
  )
  const latestPayslip = data.payslips?.[0]
  const avgScore =
    data.performanceScores?.length
      ? Math.round(
          data.performanceScores.reduce((s: number, r: any) => s + (r.overallScore ?? 0), 0) /
            data.performanceScores.length,
        )
      : null

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <User className="h-6 w-6 text-amber-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-bold text-[var(--text-1)]">{emp?.name ?? 'Karyawan'}</h1>
          <p className="text-xs text-[var(--text-2)]">
            {emp?.position ?? ''} · {emp?.department ?? ''}
          </p>
        </div>
        <button className="rounded-xl p-2 text-[var(--text-2)] transition hover:bg-[var(--bg-subtle)]">
          <Bell className="h-5 w-5" />
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="Sisa Cuti"
          value={`${data.leaveBalance ?? 0} hari`}
          color="blue"
        />
        <StatCard
          icon={<Calendar className="h-5 w-5" />}
          label="Shift Mendatang"
          value={upcomingShifts.length}
          color="amber"
        />
        {avgScore !== null && (
          <StatCard
            icon={<Star className="h-5 w-5" />}
            label="Skor Kinerja"
            value={`${avgScore}/100`}
            color="purple"
          />
        )}
        {latestPayslip && (
          <StatCard
            icon={<FileText className="h-5 w-5" />}
            label="Gaji Terakhir"
            value={formatCurrency(latestPayslip.netPay ?? 0, currency)}
            sub={latestPayslip.period}
            color="emerald"
          />
        )}
      </div>

      {/* Shifts */}
      <Section
        title="Jadwal Shift"
        icon={<Calendar className="h-4 w-4" />}
        defaultOpen={true}
      >
        {upcomingShifts.length === 0 ? (
          <p className="py-2 text-center text-sm text-[var(--text-2)]">Tidak ada shift mendatang</p>
        ) : (
          <div className="space-y-2">
            {upcomingShifts.slice(0, 5).map((s: any) => (
              <ShiftRow key={s.id} shift={s} onAck={id => ackMutation.mutate(id)} />
            ))}
          </div>
        )}
      </Section>

      {/* Leave */}
      <Section title="Cuti & Izin" icon={<Clock className="h-4 w-4" />}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-[var(--text-2)]">
            Sisa cuti:{' '}
            <span className="font-semibold text-[var(--text-1)]">
              {data.leaveBalance ?? 0} hari
            </span>
          </p>
          <button
            onClick={() => setShowLeaveForm(true)}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajukan Cuti
          </button>
        </div>
        {data.pendingLeaves?.length === 0 ? (
          <p className="text-sm text-[var(--text-2)]">Tidak ada pengajuan aktif</p>
        ) : (
          <div className="space-y-2">
            {(data.pendingLeaves ?? []).slice(0, 5).map((l: any) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--text-1)]">
                    {LEAVE_TYPE_LABEL[l.type] ?? l.type}
                  </p>
                  <p className="text-xs text-[var(--text-2)]">
                    {l.startDate} → {l.endDate}
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    STATUS_PILL[l.status] ?? 'bg-stone-100 text-stone-600',
                  )}
                >
                  {l.status === 'PENDING'
                    ? 'Menunggu'
                    : l.status === 'APPROVED'
                      ? 'Disetujui'
                      : 'Ditolak'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Payslips */}
      <Section title="Slip Gaji" icon={<FileText className="h-4 w-4" />}>
        {data.payslips?.length === 0 ? (
          <p className="text-sm text-[var(--text-2)]">Belum ada slip gaji</p>
        ) : (
          <div className="space-y-2">
            {(data.payslips ?? []).slice(0, 6).map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--text-1)]">{p.period}</p>
                  <p className="text-xs text-[var(--text-2)]">
                    {formatCurrency(p.netPay ?? 0, currency)}
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    STATUS_PILL[p.status] ?? 'bg-stone-100 text-stone-600',
                  )}
                >
                  {p.status === 'ISSUED' ? 'Diterbitkan' : 'Draft'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Performance */}
      {data.performanceScores?.length > 0 && (
        <Section title="Penilaian Kinerja" icon={<Star className="h-4 w-4" />}>
          <div className="space-y-2">
            {data.performanceScores.slice(0, 3).map((r: any) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--text-1)]">
                    {r.reviewPeriod ?? r.period}
                  </p>
                  {r.feedback && (
                    <p className="mt-0.5 text-xs text-[var(--text-2)] line-clamp-1">{r.feedback}</p>
                  )}
                </div>
                <span className="text-sm font-bold text-amber-600">{r.overallScore}/100</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Training */}
      {data.trainingStatus?.length > 0 && (
        <Section title="Status Pelatihan" icon={<BookOpen className="h-4 w-4" />}>
          <div className="space-y-2">
            {data.trainingStatus.slice(0, 5).map((t: any) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--text-1)]">{t.title ?? t.name}</p>
                  <p className="text-xs text-[var(--text-2)]">{t.completedAt ?? t.scheduledAt}</p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    t.status === 'COMPLETED'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200',
                  )}
                >
                  {t.status === 'COMPLETED' ? 'Selesai' : 'Dalam Proses'}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {showLeaveForm && (
        <LeaveRequestForm
          storeId={storeId}
          employeeId={employeeId}
          onClose={() => setShowLeaveForm(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['self-service', employeeId] })}
        />
      )}
    </div>
  )
}
