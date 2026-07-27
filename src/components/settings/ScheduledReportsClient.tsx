'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Mail, Trash2, Plus, Send, AlertCircle, CheckCircle2 } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReportFrequency = 'weekly' | 'monthly'
export type ReportType = 'summary' | 'cohort' | 'products' | 'pnl'

export interface ScheduledReport {
  id: string
  storeId: string
  type: ReportType
  frequency: ReportFrequency
  recipients: string[]
  lastSentAt: string | null
  createdAt: string
  updatedAt: string
}

interface ScheduledReportsClientProps {
  storeId: string
}

// ── Pure logic (exported for tests) ──────────────────────────────────────────

/** Check if a scheduled report is due based on its frequency and lastSentAt */
export function isReportDue(
  frequency: ReportFrequency,
  lastSentAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!lastSentAt) return true
  const last = new Date(lastSentAt)
  const diffMs = now.getTime() - last.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (frequency === 'weekly') return diffDays >= 7
  if (frequency === 'monthly') return diffDays >= 30
  return false
}

/** Get the next send date string for a scheduled report */
export function nextSendDate(
  frequency: ReportFrequency,
  lastSentAt: string | null,
  now: Date = new Date(),
): Date {
  if (!lastSentAt) return now
  const last = new Date(lastSentAt)
  const intervalDays = frequency === 'weekly' ? 7 : 30
  const next = new Date(last.getTime() + intervalDays * 24 * 60 * 60 * 1000)
  return next < now ? now : next
}

/** Validate a list of email addresses — returns invalid ones */
export function validateEmails(emails: string[]): string[] {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emails.filter(e => !re.test(e.trim()))
}

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  summary: 'Sales Summary',
  cohort: 'Cohort Retention',
  products: 'Product Analytics',
  pnl: 'Profit & Loss',
}

const FREQ_LABELS: Record<ReportFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ScheduledReportsClient({ storeId }: ScheduledReportsClientProps) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<ReportType>('summary')
  const [formFreq, setFormFreq] = useState<ReportFrequency>('weekly')
  const [formEmails, setFormEmails] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [sentId, setSentId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['scheduled-reports', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/scheduled?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to load scheduled reports')
      return res.json() as Promise<{ items: ScheduledReport[] }>
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: { type: ReportType; frequency: ReportFrequency; recipients: string[] }) => {
      const res = await fetch(`/api/reports/scheduled?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const e = await res.json() as { error?: string }
        throw new Error(e.error ?? 'Failed to create')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled-reports', storeId] })
      setShowForm(false)
      setFormEmails('')
      setFormError(null)
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/reports/scheduled/${id}?storeId=${storeId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-reports', storeId] }),
  })

  const sendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/reports/scheduled/send/${id}?storeId=${storeId}`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to send')
      return res.json()
    },
    onSuccess: (_, id) => {
      setSentId(id)
      qc.invalidateQueries({ queryKey: ['scheduled-reports', storeId] })
      setTimeout(() => setSentId(null), 3000)
    },
  })

  function handleCreate() {
    const recipients = formEmails
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(Boolean)
    const invalid = validateEmails(recipients)
    if (invalid.length > 0) {
      setFormError(`Invalid emails: ${invalid.join(', ')}`)
      return
    }
    if (recipients.length === 0) {
      setFormError('At least one recipient is required')
      return
    }
    setFormError(null)
    createMutation.mutate({ type: formType, frequency: formFreq, recipients })
  }

  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[var(--primary)]" />
          <h3 className="font-semibold text-[var(--text-primary)]">Scheduled Reports</h3>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setFormError(null) }}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Plus className="h-3.5 w-3.5" />
          New Schedule
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-hover)] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Report Type</label>
              <select
                value={formType}
                onChange={e => setFormType(e.target.value as ReportType)}
                className="w-full rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
              >
                {(Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map(t => (
                  <option key={t} value={t}>{REPORT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Frequency</label>
              <select
                value={formFreq}
                onChange={e => setFormFreq(e.target.value as ReportFrequency)}
                className="w-full rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
              >
                {(Object.keys(FREQ_LABELS) as ReportFrequency[]).map(f => (
                  <option key={f} value={f}>{FREQ_LABELS[f]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">
              Recipients (comma or newline separated)
            </label>
            <textarea
              value={formEmails}
              onChange={e => setFormEmails(e.target.value)}
              placeholder="alice@example.com, bob@example.com"
              rows={3}
              className="w-full rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)] resize-none"
            />
          </div>
          {formError && (
            <div className="flex items-center gap-2 text-red-500 text-xs">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {formError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="rounded-lg bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {createMutation.isPending ? 'Saving…' : 'Save Schedule'}
            </button>
            <button
              onClick={() => { setShowForm(false); setFormError(null) }}
              className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading && (
        <p className="text-sm text-[var(--text-muted)] py-4 text-center">Loading…</p>
      )}
      {isError && (
        <div className="flex items-center gap-2 text-red-500 text-sm py-4">
          <AlertCircle className="h-4 w-4" /> Failed to load scheduled reports
        </div>
      )}
      {!isLoading && items.length === 0 && (
        <p className="text-sm text-[var(--text-muted)] py-4 text-center">
          No scheduled reports yet. Create one to receive periodic email digests.
        </p>
      )}
      <div className="space-y-2">
        {items.map(item => {
          const due = isReportDue(item.frequency, item.lastSentAt)
          const next = nextSendDate(item.frequency, item.lastSentAt)
          return (
            <div
              key={item.id}
              className="flex items-start justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 gap-3"
            >
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-[var(--primary)] mt-0.5 flex-shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {REPORT_TYPE_LABELS[item.type]}
                    </span>
                    <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                      {FREQ_LABELS[item.frequency]}
                    </span>
                    {due && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500 font-medium">
                        Due
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {item.recipients.join(', ')}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Next: {next.toLocaleDateString()}
                    {item.lastSentAt && ` · Last sent: ${new Date(item.lastSentAt).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {sentId === item.id ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-500">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Sent
                  </span>
                ) : (
                  <button
                    onClick={() => sendMutation.mutate(item.id)}
                    disabled={sendMutation.isPending}
                    title="Send now"
                    className="rounded p-1.5 text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => deleteMutation.mutate(item.id)}
                  disabled={deleteMutation.isPending}
                  title="Delete"
                  className="rounded p-1.5 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
