'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle,
  Circle,
  Clock,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  UserCheck,
  UserMinus,
  AlertCircle,
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnboardingTask {
  name: string
  description?: string
  dueInDays: number
  completed: boolean
  completedAt: string | null
}

export interface OnboardingTemplate {
  id: string
  storeId: string
  name: string
  type: 'ONBOARDING' | 'OFFBOARDING'
  tasks: { name: string; description: string; dueInDays: number }[]
  createdAt: string
}

export interface EmployeeOnboardingRecord {
  id: string
  employeeId: string
  employeeName?: string
  storeId: string
  templateId?: string
  status: 'IN_PROGRESS' | 'COMPLETED'
  startDate: string
  tasks: OnboardingTask[]
  createdAt: string
}

export interface EmployeeOffboardingRecord {
  id: string
  employeeId: string
  employeeName?: string
  storeId: string
  templateId?: string
  status: 'IN_PROGRESS' | 'COMPLETED'
  lastWorkingDate?: string
  reason?: string
  tasks: OnboardingTask[]
  createdAt: string
}

// ─── Pure business logic (exported for unit tests) ────────────────────────────

export function calcCompletionPct(tasks: OnboardingTask[]): number {
  if (tasks.length === 0) return 0
  const done = tasks.filter(t => t.completed).length
  return Math.round((done / tasks.length) * 100)
}

export function calcDueDate(startDate: string, dueInDays: number): Date {
  const d = new Date(startDate)
  d.setDate(d.getDate() + dueInDays)
  return d
}

export function isTaskOverdue(task: OnboardingTask, startDate: string, now = new Date()): boolean {
  if (task.completed) return false
  const due = calcDueDate(startDate, task.dueInDays)
  return now > due
}

export function getOverdueTasks(tasks: OnboardingTask[], startDate: string, now = new Date()): OnboardingTask[] {
  return tasks.filter(t => isTaskOverdue(t, startDate, now))
}

export function applyTemplateToRecord(
  templateTasks: { name: string; description: string; dueInDays: number }[],
): OnboardingTask[] {
  return templateTasks.map(t => ({
    name: t.name,
    description: t.description,
    dueInDays: t.dueInDays,
    completed: false,
    completedAt: null,
  }))
}

// ─── Default templates ────────────────────────────────────────────────────────

const DEFAULT_ONBOARDING_TASKS = [
  { name: 'Pengisian Dokumen Kontrak', description: 'Isi dan tanda tangani kontrak kerja', dueInDays: 1 },
  { name: 'Pengumpulan Dokumen Identitas', description: 'KTP, NPWP, rekening bank', dueInDays: 1 },
  { name: 'Orientasi Perusahaan', description: 'Pengenalan budaya, visi, dan misi perusahaan', dueInDays: 3 },
  { name: 'Pelatihan Sistem POS', description: 'Training penggunaan sistem kasir', dueInDays: 5 },
  { name: 'Pengenalan Tim', description: 'Perkenalan dengan seluruh anggota tim', dueInDays: 2 },
  { name: 'Setup Akun & Akses Sistem', description: 'Pembuatan akun dan pemberian akses', dueInDays: 1 },
  { name: 'Pemberian Seragam & Perlengkapan', description: 'Penyerahan seragam dan alat kerja', dueInDays: 3 },
  { name: 'Pelatihan SOP Operasional', description: 'Training prosedur kerja standar', dueInDays: 7 },
]

const DEFAULT_OFFBOARDING_TASKS = [
  { name: 'Wawancara Exit Interview', description: 'Sesi wawancara perpisahan dengan HR', dueInDays: 0 },
  { name: 'Pengembalian Seragam & Perlengkapan', description: 'Kembalikan semua aset perusahaan', dueInDays: 0 },
  { name: 'Pengembalian Akses & ID Card', description: 'Kembalikan kartu akses dan ID pegawai', dueInDays: 0 },
  { name: 'Pencabutan Akun Sistem', description: 'Nonaktifkan semua akun dan akses sistem', dueInDays: 0 },
  { name: 'Serah Terima Pekerjaan', description: 'Serah terima tugas kepada pengganti', dueInDays: -3 },
  { name: 'Penyelesaian Klaim & Tunjangan', description: 'Proses pembayaran klaim dan tunjangan akhir', dueInDays: 3 },
  { name: 'Penerbitan Surat Pengalaman Kerja', description: 'Siapkan referensi / surat keterangan', dueInDays: 5 },
]

// ─── Shared UI helpers ────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const cardCls = 'bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm'

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    IN_PROGRESS: 'bg-amber-50 text-amber-700 border border-amber-200',
    COMPLETED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  }
  const labels: Record<string, string> = {
    IN_PROGRESS: 'Sedang Berjalan',
    COMPLETED: 'Selesai',
  }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', cfg[status] ?? 'bg-stone-100 text-stone-500 border border-stone-200')}>
      {labels[status] ?? status}
    </span>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full bg-[var(--bg-subtle)] rounded-full h-2 overflow-hidden">
      <div
        className={cn('h-2 rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-amber-400')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─── Task list for a record ────────────────────────────────────────────────────

function TaskList({
  record,
  mode,
  storeId,
  onRefresh,
}: {
  record: EmployeeOnboardingRecord | EmployeeOffboardingRecord
  mode: 'onboarding' | 'offboarding'
  storeId: string
  onRefresh: () => void
}) {
  const [loading, setLoading] = useState<number | null>(null)

  const toggleTask = async (idx: number, completed: boolean) => {
    setLoading(idx)
    try {
      const endpoint =
        mode === 'onboarding'
          ? `/api/hr/employee-onboarding/${record.id}`
          : `/api/hr/employee-offboarding/${record.id}` // offboarding uses same PATCH shape via separate handler

      // For offboarding we do an inline tasks update
      if (mode === 'offboarding') {
        const updated = record.tasks.map((t, i) =>
          i === idx ? { ...t, completed, completedAt: completed ? new Date().toISOString() : null } : t,
        )
        const res = await fetch(`/api/hr/employee-offboarding/${record.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tasks: updated }),
        })
        const json = await res.json() as any
        if (json.error) { toast.error(json.error); return }
      } else {
        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskIndex: idx, completed }),
        })
        const json = await res.json() as any
        if (json.error) { toast.error(json.error); return }
      }
      toast.success(completed ? 'Tugas selesai' : 'Tugas dibuka kembali')
      onRefresh()
    } catch {
      toast.error('Gagal memperbarui tugas')
    } finally {
      setLoading(null)
    }
  }

  const now = new Date()
  const pct = calcCompletionPct(record.tasks)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-3)]">
        <span>{pct}% selesai</span>
        <span>{record.tasks.filter(t => t.completed).length}/{record.tasks.length} tugas</span>
      </div>
      <ProgressBar pct={pct} />
      <div className="space-y-2 mt-3">
        {record.tasks.map((task, idx) => {
          const due = calcDueDate((record as any).startDate ?? (record as any).lastWorkingDate ?? new Date().toISOString(), task.dueInDays)
          const overdue = !task.completed && now > due
          return (
            <button
              key={idx}
              onClick={() => toggleTask(idx, !task.completed)}
              disabled={loading === idx}
              className={cn(
                'w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all',
                task.completed
                  ? 'bg-emerald-50/50 border-emerald-200'
                  : overdue
                  ? 'bg-red-50/50 border-red-200 hover:bg-red-50'
                  : 'bg-[var(--bg-subtle)] border-[var(--border)] hover:border-amber-400/50',
              )}
            >
              {task.completed ? (
                <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              ) : overdue ? (
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-[var(--text-3)] mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium', task.completed ? 'line-through text-[var(--text-3)]' : 'text-[var(--text-1)]')}>
                  {task.name}
                </p>
                {task.description && (
                  <p className="text-xs text-[var(--text-3)] mt-0.5">{task.description}</p>
                )}
                <p className={cn('text-xs mt-1', overdue ? 'text-red-500' : 'text-[var(--text-3)]')}>
                  {task.completed && task.completedAt
                    ? `Selesai ${new Date(task.completedAt).toLocaleDateString('id-ID')}`
                    : overdue
                    ? `Terlambat — jatuh tempo ${due.toLocaleDateString('id-ID')}`
                    : `Jatuh tempo ${due.toLocaleDateString('id-ID')}`}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Offboarding PATCH handler (separate API) ─────────────────────────────────
// We need a PATCH route for offboarding too — it lives inline here as a fetch wrapper.

// ─── Record card ──────────────────────────────────────────────────────────────

function RecordCard({
  record,
  mode,
  storeId,
  onRefresh,
}: {
  record: EmployeeOnboardingRecord | EmployeeOffboardingRecord
  mode: 'onboarding' | 'offboarding'
  storeId: string
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const pct = calcCompletionPct(record.tasks)
  const overdueTasks = getOverdueTasks(record.tasks, (record as any).startDate ?? (record as any).lastWorkingDate ?? new Date().toISOString())

  return (
    <div className={cardCls}>
      <div
        className="flex items-center justify-between gap-3 cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-[var(--text-1)] truncate">
              {record.employeeName ?? record.employeeId}
            </p>
            <StatusPill status={record.status} />
            {overdueTasks.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-600 border border-red-200">
                <AlertCircle className="w-3 h-3" />
                {overdueTasks.length} terlambat
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-3)] mt-0.5">
            {mode === 'onboarding'
              ? `Mulai: ${new Date((record as any).startDate).toLocaleDateString('id-ID')}`
              : `Hari Terakhir: ${(record as EmployeeOffboardingRecord).lastWorkingDate
                  ? new Date((record as EmployeeOffboardingRecord).lastWorkingDate!).toLocaleDateString('id-ID')
                  : '—'}`}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar pct={pct} />
            <span className="text-xs text-[var(--text-3)] shrink-0">{pct}%</span>
          </div>
        </div>
        <div className="shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4 text-[var(--text-3)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-3)]" />}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <TaskList record={record} mode={mode} storeId={storeId} onRefresh={onRefresh} />
        </div>
      )}
    </div>
  )
}

// ─── New onboarding/offboarding form ─────────────────────────────────────────

function NewRecordForm({
  storeId,
  mode,
  onClose,
  onCreated,
}: {
  storeId: string
  mode: 'onboarding' | 'offboarding'
  onClose: () => void
  onCreated: () => void
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [lastWorkingDate, setLastWorkingDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const defaultTasks = mode === 'onboarding' ? DEFAULT_ONBOARDING_TASKS : DEFAULT_OFFBOARDING_TASKS

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!employeeId.trim()) { toast.error('ID karyawan wajib diisi'); return }
    setSaving(true)
    try {
      const tasks = applyTemplateToRecord(defaultTasks)
      const body =
        mode === 'onboarding'
          ? { storeId, employeeId: employeeId.trim(), startDate, tasks }
          : { storeId, employeeId: employeeId.trim(), lastWorkingDate: lastWorkingDate || undefined, reason: reason || undefined, tasks }
      const endpoint = mode === 'onboarding' ? '/api/hr/employee-onboarding' : '/api/hr/employee-offboarding'
      const res = await fetch(`${endpoint}?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success(mode === 'onboarding' ? 'Onboarding dibuat' : 'Offboarding dibuat')
      onCreated()
      onClose()
    } catch {
      toast.error('Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl w-full max-w-md border border-[var(--border)]">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[var(--text-1)]">
            {mode === 'onboarding' ? 'Mulai Onboarding' : 'Mulai Offboarding'}
          </h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">ID Karyawan *</label>
            <input className={inputCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="emp_xxx" required />
          </div>
          {mode === 'onboarding' ? (
            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Tanggal Mulai</label>
              <input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Hari Terakhir Kerja</label>
                <input type="date" className={inputCls} value={lastWorkingDate} onChange={e => setLastWorkingDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Alasan Keluar</label>
                <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="Resign, kontrak selesai, dst." />
              </div>
            </>
          )}
          <p className="text-xs text-[var(--text-3)]">
            Template default ({defaultTasks.length} tugas) akan digunakan secara otomatis.
          </p>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)] transition-colors">
              Batal
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-stone-900 font-medium text-sm disabled:opacity-50 transition-colors">
              {saving ? 'Menyimpan…' : 'Buat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

interface OnboardingClientProps {
  storeId: string
}

export default function OnboardingClient({ storeId }: OnboardingClientProps) {
  const [activeTab, setActiveTab] = useState<'onboarding' | 'offboarding'>('onboarding')
  const [showForm, setShowForm] = useState(false)
  const qc = useQueryClient()

  const { data: onboardingData, refetch: refetchOnboarding } = useQuery({
    queryKey: ['employee-onboarding', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/employee-onboarding?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json() as any
      return (json.data ?? []) as EmployeeOnboardingRecord[]
    },
  })

  const { data: offboardingData, refetch: refetchOffboarding } = useQuery({
    queryKey: ['employee-offboarding', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/employee-offboarding?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json() as any
      return (json.data ?? []) as EmployeeOffboardingRecord[]
    },
  })

  const handleRefresh = useCallback(() => {
    if (activeTab === 'onboarding') refetchOnboarding()
    else refetchOffboarding()
  }, [activeTab, refetchOnboarding, refetchOffboarding])

  const activeRecords = activeTab === 'onboarding' ? (onboardingData ?? []) : (offboardingData ?? [])
  const inProgress = activeRecords.filter(r => r.status === 'IN_PROGRESS')
  const completed = activeRecords.filter(r => r.status === 'COMPLETED')

  const tabCls = (tab: 'onboarding' | 'offboarding') =>
    cn(
      'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
      activeTab === tab
        ? 'bg-amber-400 text-stone-900 shadow-sm'
        : 'text-[var(--text-2)] hover:bg-[var(--bg-subtle)]',
    )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Onboarding & Offboarding</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">Kelola proses masuk dan keluar karyawan</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-500 text-stone-900 font-medium text-sm rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {activeTab === 'onboarding' ? 'Mulai Onboarding' : 'Mulai Offboarding'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Onboarding Aktif', value: onboardingData?.filter(r => r.status === 'IN_PROGRESS').length ?? 0, icon: UserCheck, color: 'text-amber-500' },
          { label: 'Onboarding Selesai', value: onboardingData?.filter(r => r.status === 'COMPLETED').length ?? 0, icon: CheckCircle, color: 'text-emerald-500' },
          { label: 'Offboarding Aktif', value: offboardingData?.filter(r => r.status === 'IN_PROGRESS').length ?? 0, icon: UserMinus, color: 'text-red-500' },
          { label: 'Offboarding Selesai', value: offboardingData?.filter(r => r.status === 'COMPLETED').length ?? 0, icon: ClipboardList, color: 'text-stone-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className={cardCls}>
            <div className="flex items-center gap-3">
              <Icon className={cn('w-5 h-5 shrink-0', color)} />
              <div>
                <p className="text-xl font-bold text-[var(--text-1)]">{value}</p>
                <p className="text-xs text-[var(--text-3)]">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        <button className={tabCls('onboarding')} onClick={() => setActiveTab('onboarding')}>
          <UserCheck className="w-4 h-4" />
          Onboarding
        </button>
        <button className={tabCls('offboarding')} onClick={() => setActiveTab('offboarding')}>
          <UserMinus className="w-4 h-4" />
          Offboarding
        </button>
      </div>

      {/* In-progress */}
      {inProgress.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-2)]">
            <Clock className="w-4 h-4" />
            Sedang Berjalan ({inProgress.length})
          </div>
          {inProgress.map(r => (
            <RecordCard
              key={r.id}
              record={r}
              mode={activeTab}
              storeId={storeId}
              onRefresh={handleRefresh}
            />
          ))}
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-2)]">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            Selesai ({completed.length})
          </div>
          {completed.map(r => (
            <RecordCard
              key={r.id}
              record={r}
              mode={activeTab}
              storeId={storeId}
              onRefresh={handleRefresh}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {activeRecords.length === 0 && (
        <div className="text-center py-16 text-[var(--text-3)]">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Belum ada data {activeTab === 'onboarding' ? 'onboarding' : 'offboarding'}</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-sm text-amber-500 hover:underline"
          >
            Buat sekarang
          </button>
        </div>
      )}

      {showForm && (
        <NewRecordForm
          storeId={storeId}
          mode={activeTab}
          onClose={() => setShowForm(false)}
          onCreated={handleRefresh}
        />
      )}
    </div>
  )
}
