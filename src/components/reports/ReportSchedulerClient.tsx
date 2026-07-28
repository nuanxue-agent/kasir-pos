'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Calendar,
  Clock,
  Play,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  X,
  Mail,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReportType = 'SALES' | 'INVENTORY' | 'PAYROLL' | 'PNL'
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY'

export interface ReportSchedule {
  id: string
  storeId: string
  reportType: ReportType
  frequency: Frequency
  recipients: string[]
  nextRunAt: string | null
  lastRunAt: string | null
  active: boolean
  createdAt: string
}

interface ReportSchedulerClientProps {
  storeId: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const REPORT_LABELS: Record<ReportType, string> = {
  SALES: 'Sales Summary',
  INVENTORY: 'Inventory Levels',
  PAYROLL: 'Payroll Summary',
  PNL: 'Profit & Loss',
}

const REPORT_COLORS: Record<ReportType, string> = {
  SALES: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  INVENTORY: 'bg-blue-50 text-blue-700 border-blue-200',
  PAYROLL: 'bg-purple-50 text-purple-700 border-purple-200',
  PNL: 'bg-orange-50 text-orange-700 border-orange-200',
}

const FREQUENCY_LABELS: Record<Frequency, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
}

const FREQUENCY_COLORS: Record<Frequency, string> = {
  DAILY: 'bg-indigo-50 text-indigo-700',
  WEEKLY: 'bg-violet-50 text-violet-700',
  MONTHLY: 'bg-pink-50 text-pink-700',
}

// ── Schedule Form ─────────────────────────────────────────────────────────────

interface ScheduleFormProps {
  storeId: string
  initial?: Partial<ReportSchedule>
  onSave: (data: Partial<ReportSchedule>) => void
  onCancel: () => void
  saving: boolean
}

function ScheduleForm({ storeId, initial, onSave, onCancel, saving }: ScheduleFormProps) {
  const [reportType, setReportType] = useState<ReportType>(initial?.reportType ?? 'SALES')
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'WEEKLY')
  const [recipientsRaw, setRecipientsRaw] = useState(
    (initial?.recipients ?? []).join(', '),
  )
  const [active, setActive] = useState(initial?.active ?? true)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const recipients = recipientsRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    onSave({ reportType, frequency, recipients, active, storeId })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-[var(--text-1)]">
        {initial?.id ? 'Edit Schedule' : 'New Report Schedule'}
      </h3>

      {/* Report type */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
          Report Type
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(REPORT_LABELS) as ReportType[]).map(rt => (
            <button
              key={rt}
              type="button"
              onClick={() => setReportType(rt)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                reportType === rt
                  ? REPORT_COLORS[rt]
                  : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)] hover:bg-[var(--bg-card)]'
              }`}
            >
              {REPORT_LABELS[rt]}
            </button>
          ))}
        </div>
      </div>

      {/* Frequency */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Frequency</label>
        <div className="flex gap-2">
          {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                frequency === f
                  ? FREQUENCY_COLORS[f]
                  : 'border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)]'
              }`}
            >
              {FREQUENCY_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Recipients */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
          Recipients (comma-separated emails)
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2">
          <Mail className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
          <input
            type="text"
            value={recipientsRaw}
            onChange={e => setRecipientsRaw(e.target.value)}
            placeholder="alice@example.com, bob@example.com"
            className="flex-1 bg-transparent text-sm text-[var(--text-1)] placeholder-[var(--text-3)] outline-none"
          />
        </div>
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActive(a => !a)}
          className={`relative h-5 w-9 rounded-full transition-colors ${active ? 'bg-indigo-600' : 'bg-[var(--border)]'}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`}
          />
        </button>
        <span className="text-xs text-[var(--text-2)]">{active ? 'Active' : 'Paused'}</span>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>
    </form>
  )
}

// ── Schedule Card ─────────────────────────────────────────────────────────────

interface ScheduleCardProps {
  schedule: ReportSchedule
  onEdit: () => void
  onDelete: () => void
  onRunNow: () => void
  running: boolean
  deleting: boolean
}

function ScheduleCard({
  schedule,
  onEdit,
  onDelete,
  onRunNow,
  running,
  deleting,
}: ScheduleCardProps) {
  return (
    <div
      className={`rounded-xl border bg-[var(--bg-card)] p-4 shadow-sm transition-shadow hover:shadow-md ${
        schedule.active ? 'border-[var(--border)]' : 'border-dashed border-[var(--border)] opacity-60'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${REPORT_COLORS[schedule.reportType]}`}
          >
            {REPORT_LABELS[schedule.reportType]}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${FREQUENCY_COLORS[schedule.frequency]}`}
          >
            {FREQUENCY_LABELS[schedule.frequency]}
          </span>
          {!schedule.active && (
            <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-3)]">
              Paused
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="rounded p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="rounded p-1.5 text-[var(--text-3)] hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
            title="Delete"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Recipients */}
      {schedule.recipients.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {schedule.recipients.map(r => (
            <span
              key={r}
              className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-2)]"
            >
              <Mail className="h-2.5 w-2.5" />
              {r}
            </span>
          ))}
        </div>
      )}

      {/* Timestamps */}
      <div className="mb-3 grid grid-cols-2 gap-2 text-[11px] text-[var(--text-3)]">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>
            Next:{' '}
            {schedule.nextRunAt ? formatDate(schedule.nextRunAt) : '—'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          <span>
            Last:{' '}
            {schedule.lastRunAt ? formatDate(schedule.lastRunAt) : 'Never'}
          </span>
        </div>
      </div>

      {/* Run now */}
      <button
        onClick={onRunNow}
        disabled={running}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60"
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5 fill-indigo-600" />
        )}
        Run Now
      </button>
    </div>
  )
}

// ── Main ReportSchedulerClient ────────────────────────────────────────────────

export default function ReportSchedulerClient({ storeId }: ReportSchedulerClientProps) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<ReportSchedule | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<{ id: string; ok: boolean } | null>(null)

  const { data: schedules = [], isLoading } = useQuery<ReportSchedule[]>({
    queryKey: ['report-schedules', storeId],
    queryFn: () =>
      fetch(`/api/report-schedules?storeId=${storeId}`).then(r => r.json()),
  })

  const createMutation = useMutation({
    mutationFn: (data: Partial<ReportSchedule>) =>
      fetch(`/api/report-schedules?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-schedules', storeId] })
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<ReportSchedule> & { id: string }) =>
      fetch(`/api/report-schedules/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-schedules', storeId] })
      setEditingSchedule(null)
    },
  })

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await fetch(`/api/report-schedules/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false, deleted: true }),
      })
      qc.invalidateQueries({ queryKey: ['report-schedules', storeId] })
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRunNow(id: string) {
    setRunningId(id)
    setRunResult(null)
    try {
      const res = await fetch(`/api/report-schedules/${id}/run?storeId=${storeId}`, {
        method: 'POST',
      }).then(r => r.json()) as { error?: string }
      setRunResult({ id, ok: !res.error })
      qc.invalidateQueries({ queryKey: ['report-schedules', storeId] })
    } finally {
      setRunningId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)]">Scheduled Reports</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">
            Automate report delivery to your team
          </p>
        </div>
        <button
          onClick={() => {
            setEditingSchedule(null)
            setShowForm(true)
          }}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-95 transition-all"
        >
          <Plus className="h-4 w-4" />
          New Schedule
        </button>
      </div>

      {/* Run result toast */}
      {runResult && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
            runResult.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-600'
          }`}
        >
          {runResult.ok ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4" />
          )}
          {runResult.ok ? 'Report triggered successfully.' : 'Failed to run report.'}
          <button
            onClick={() => setRunResult(null)}
            className="ml-auto rounded p-0.5 hover:bg-black/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Create form */}
      {showForm && !editingSchedule && (
        <ScheduleForm
          storeId={storeId}
          onSave={data => createMutation.mutate(data)}
          onCancel={() => setShowForm(false)}
          saving={createMutation.isPending}
        />
      )}

      {/* Edit form */}
      {editingSchedule && (
        <ScheduleForm
          storeId={storeId}
          initial={editingSchedule}
          onSave={data => updateMutation.mutate({ id: editingSchedule.id, ...data })}
          onCancel={() => setEditingSchedule(null)}
          saving={updateMutation.isPending}
        />
      )}

      {/* Schedules grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map(i => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]"
            />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-12 text-center">
          <Calendar className="mx-auto mb-3 h-10 w-10 text-[var(--text-3)]" />
          <p className="text-sm font-medium text-[var(--text-2)]">No schedules yet</p>
          <p className="mt-1 text-xs text-[var(--text-3)]">
            Create a schedule to automate report delivery.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {schedules.map(s => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              onEdit={() => {
                setShowForm(false)
                setEditingSchedule(s)
              }}
              onDelete={() => handleDelete(s.id)}
              onRunNow={() => handleRunNow(s.id)}
              running={runningId === s.id}
              deleting={deletingId === s.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
