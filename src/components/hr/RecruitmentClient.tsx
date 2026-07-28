'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Briefcase,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  User,
  Mail,
  Phone,
  FileText,
  Search,
  Filter,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Types ────────────────────────────────────────────────────────────────────

export type JobType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT'
export type JobStatus = 'DRAFT' | 'OPEN' | 'CLOSED'
export type ApplicantStatus = 'NEW' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED'

export interface JobPosting {
  id: string
  storeId: string
  title: string
  department: string
  type: JobType
  description: string
  requirements: string
  status: JobStatus
  postedAt: string | null
  closedAt: string | null
  createdAt: string
}

export interface Applicant {
  id: string
  jobId: string
  storeId: string
  name: string
  email: string
  phone: string
  resumeUrl: string
  status: ApplicantStatus
  notes: string
  appliedAt: string
  jobTitle?: string
}

// ─── Pure business logic (exported for unit tests) ────────────────────────────

export const PIPELINE_STAGES: ApplicantStatus[] = [
  'NEW', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED',
]

export const VALID_TRANSITIONS: Record<ApplicantStatus, ApplicantStatus[]> = {
  NEW:       ['SCREENING', 'REJECTED'],
  SCREENING: ['INTERVIEW', 'REJECTED'],
  INTERVIEW: ['OFFER', 'REJECTED'],
  OFFER:     ['HIRED', 'REJECTED'],
  HIRED:     [],
  REJECTED:  [],
}

export function isValidTransition(from: ApplicantStatus, to: ApplicantStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function getPipelineStageCount(applicants: Applicant[]): Record<ApplicantStatus, number> {
  const counts = {} as Record<ApplicantStatus, number>
  for (const s of PIPELINE_STAGES) counts[s] = 0
  for (const a of applicants) counts[a.status] = (counts[a.status] ?? 0) + 1
  return counts
}

export function calcTimeToHireDays(applicant: Applicant): number | null {
  if (applicant.status !== 'HIRED') return null
  const applied = new Date(applicant.appliedAt).getTime()
  const hired = Date.now()
  return Math.round((hired - applied) / (1000 * 60 * 60 * 24))
}

export function calcTimeToHireDaysFromDates(appliedAt: string, hiredAt: string): number {
  const applied = new Date(appliedAt).getTime()
  const hired = new Date(hiredAt).getTime()
  return Math.round((hired - applied) / (1000 * 60 * 60 * 24))
}

export function calcOfferAcceptanceRate(applicants: Applicant[]): number {
  const offered = applicants.filter(a => a.status === 'OFFER' || a.status === 'HIRED').length
  if (offered === 0) return 0
  const hired = applicants.filter(a => a.status === 'HIRED').length
  return Math.round((hired / offered) * 100)
}

export interface ScoredApplicant {
  applicant: Applicant
  score: number
}

export function rankApplicantsByScore(applicants: Applicant[]): ScoredApplicant[] {
  const stageScore: Record<ApplicantStatus, number> = {
    NEW: 1, SCREENING: 2, INTERVIEW: 3, OFFER: 4, HIRED: 5, REJECTED: 0,
  }
  return applicants
    .map(a => ({ applicant: a, score: stageScore[a.status] ?? 0 }))
    .sort((a, b) => b.score - a.score)
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JOB_TYPE_LABELS: Record<JobType, string> = {
  FULL_TIME: 'Full Time',
  PART_TIME: 'Part Time',
  CONTRACT:  'Kontrak',
}

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT:  'Draft',
  OPEN:   'Buka',
  CLOSED: 'Tutup',
}

const APPLICANT_STATUS_LABELS: Record<ApplicantStatus, string> = {
  NEW:       'Baru',
  SCREENING: 'Seleksi',
  INTERVIEW: 'Wawancara',
  OFFER:     'Penawaran',
  HIRED:     'Diterima',
  REJECTED:  'Ditolak',
}

const APPLICANT_STATUS_COLORS: Record<ApplicantStatus, string> = {
  NEW:       'bg-[var(--color-info-subtle)] text-[var(--color-info)]',
  SCREENING: 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]',
  INTERVIEW: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  OFFER:     'bg-[var(--color-success-subtle)] text-[var(--color-success)]',
  HIRED:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  REJECTED:  'bg-[var(--color-danger-subtle)] text-[var(--color-danger)]',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ApplicantStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', APPLICANT_STATUS_COLORS[status])}>
      {APPLICANT_STATUS_LABELS[status]}
    </span>
  )
}

function JobStatusBadge({ status }: { status: JobStatus }) {
  const cls = {
    DRAFT:  'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]',
    OPEN:   'bg-[var(--color-success-subtle)] text-[var(--color-success)]',
    CLOSED: 'bg-[var(--color-danger-subtle)] text-[var(--color-danger)]',
  }[status]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', cls)}>
      {JOB_STATUS_LABELS[status]}
    </span>
  )
}

// ─── Job Posting Form Modal ───────────────────────────────────────────────────

interface JobFormModalProps {
  storeId: string
  onClose: () => void
  onSaved: () => void
}

function JobFormModal({ storeId, onClose, onSaved }: JobFormModalProps) {
  const [form, setForm] = useState({
    title: '', department: '', type: 'FULL_TIME' as JobType,
    description: '', requirements: '', status: 'DRAFT' as JobStatus,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title || !form.department) {
      toast.error('Judul dan departemen wajib diisi')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/hr/job-postings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, storeId }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal menyimpan'); return }
      toast.success('Lowongan berhasil disimpan')
      onSaved()
      onClose()
    } catch {
      toast.error('Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-[var(--color-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Tambah Lowongan</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--color-surface-raised)]">
            <X className="h-5 w-5 text-[var(--color-text-muted)]" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Judul Posisi</label>
            <input
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="cth. Kasir, Manajer Toko"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Departemen</label>
              <input
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                placeholder="cth. Operasional"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Tipe</label>
              <select
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as JobType }))}
              >
                {(Object.keys(JOB_TYPE_LABELS) as JobType[]).map(t => (
                  <option key={t} value={t}>{JOB_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Deskripsi</label>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Persyaratan</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Status</label>
            <select
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as JobStatus }))}
            >
              {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map(s => (
                <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)]">
              Batal
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Applicant Form Modal ─────────────────────────────────────────────────────

interface ApplicantFormModalProps {
  storeId: string
  jobId: string
  onClose: () => void
  onSaved: () => void
}

function ApplicantFormModal({ storeId, jobId, onClose, onSaved }: ApplicantFormModalProps) {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', resumeUrl: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.email) {
      toast.error('Nama dan email wajib diisi')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/hr/applicants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, storeId, jobId }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal menyimpan'); return }
      toast.success('Pelamar berhasil ditambahkan')
      onSaved()
      onClose()
    } catch {
      toast.error('Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--color-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Tambah Pelamar</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--color-surface-raised)]">
            <X className="h-5 w-5 text-[var(--color-text-muted)]" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Nama Lengkap</label>
            <input
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Email</label>
            <input
              type="email"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">No. Telepon</label>
            <input
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">URL Resume</label>
            <input
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              value={form.resumeUrl} onChange={e => setForm(f => ({ ...f, resumeUrl: e.target.value }))}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text)]">Catatan</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)]">
              Batal
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

interface KanbanCardProps {
  applicant: Applicant
  onMove: (id: string, status: ApplicantStatus) => void
}

function KanbanCard({ applicant, onMove }: KanbanCardProps) {
  const [expanded, setExpanded] = useState(false)
  const nextStages = VALID_TRANSITIONS[applicant.status]

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--color-text)]">{applicant.name}</p>
          <p className="truncate text-xs text-[var(--color-text-muted)]">{applicant.email}</p>
        </div>
        <button onClick={() => setExpanded(v => !v)}
          className="shrink-0 rounded p-0.5 hover:bg-[var(--color-surface-raised)]">
          {expanded
            ? <ChevronUp className="h-4 w-4 text-[var(--color-text-muted)]" />
            : <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1 border-t border-[var(--color-border)] pt-2">
          {applicant.phone && (
            <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
              <Phone className="h-3 w-3" />{applicant.phone}
            </div>
          )}
          {applicant.resumeUrl && (
            <a href={applicant.resumeUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
              <FileText className="h-3 w-3" />Resume
            </a>
          )}
          {applicant.notes && (
            <p className="text-xs text-[var(--color-text-muted)]">{applicant.notes}</p>
          )}
          {nextStages.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {nextStages.map(s => (
                <button key={s} onClick={() => onMove(applicant.id, s)}
                  className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs text-white hover:bg-[var(--color-primary-hover)]">
                  {APPLICANT_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Kanban Board ─────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  applicants: Applicant[]
  onMove: (id: string, status: ApplicantStatus) => void
}

function KanbanBoard({ applicants, onMove }: KanbanBoardProps) {
  const ACTIVE_STAGES: ApplicantStatus[] = ['NEW', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED']
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {ACTIVE_STAGES.map(stage => {
        const cards = applicants.filter(a => a.status === stage)
        return (
          <div key={stage} className="min-w-[180px] flex-shrink-0 rounded-xl bg-[var(--color-surface-raised)] p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                {APPLICANT_STATUS_LABELS[stage]}
              </span>
              <span className="rounded-full bg-[var(--color-border)] px-1.5 py-0.5 text-xs font-medium text-[var(--color-text-muted)]">
                {cards.length}
              </span>
            </div>
            <div className="space-y-2">
              {cards.map(a => (
                <KanbanCard key={a.id} applicant={a} onMove={onMove} />
              ))}
              {cards.length === 0 && (
                <p className="py-4 text-center text-xs text-[var(--color-text-muted)]">Kosong</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface RecruitmentClientProps {
  storeId: string
}

export default function RecruitmentClient({ storeId }: RecruitmentClientProps) {
  const qc = useQueryClient()
  const [showJobForm, setShowJobForm] = useState(false)
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null)
  const [showApplicantForm, setShowApplicantForm] = useState(false)
  const [jobSearch, setJobSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>('ALL')

  // ─── Job Postings ──────────────────────────────────────────────────────
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['hr-job-postings', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/job-postings?storeId=${storeId}`)
      return (await res.json() as any)
    },
  })
  const jobs: JobPosting[] = jobsData?.data ?? []

  // ─── Applicants ────────────────────────────────────────────────────────
  const { data: appsData, isLoading: appsLoading } = useQuery({
    queryKey: ['hr-applicants', storeId, selectedJob?.id],
    queryFn: async () => {
      const url = selectedJob
        ? `/api/hr/applicants?storeId=${storeId}&jobId=${selectedJob.id}`
        : `/api/hr/applicants?storeId=${storeId}`
      const res = await fetch(url)
      return (await res.json() as any)
    },
    enabled: !!selectedJob,
  })
  const applicants: Applicant[] = appsData?.data ?? []

  // ─── Move Stage Mutation ───────────────────────────────────────────────
  const moveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ApplicantStatus }) => {
      const res = await fetch(`/api/hr/applicants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal memperbarui')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-applicants'] })
      toast.success('Status pelamar diperbarui')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ─── Close Job Mutation ────────────────────────────────────────────────
  const closeJobMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hr/job-postings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED' }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal menutup lowongan')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-job-postings'] })
      toast.success('Lowongan ditutup')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleMove = useCallback((id: string, status: ApplicantStatus) => {
    moveMutation.mutate({ id, status })
  }, [moveMutation])

  const filteredJobs = jobs.filter(j => {
    const matchSearch = j.title.toLowerCase().includes(jobSearch.toLowerCase()) ||
      j.department.toLowerCase().includes(jobSearch.toLowerCase())
    const matchStatus = statusFilter === 'ALL' || j.status === statusFilter
    return matchSearch && matchStatus
  })

  const stageCounts = getPipelineStageCount(applicants)
  const offerRate = calcOfferAcceptanceRate(applicants)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Rekrutmen</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Kelola lowongan dan pipeline pelamar
          </p>
        </div>
        <button
          onClick={() => setShowJobForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          <Plus className="h-4 w-4" />
          Tambah Lowongan
        </button>
      </div>

      {/* Stats */}
      {selectedJob && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['NEW', 'SCREENING', 'INTERVIEW', 'OFFER'] as ApplicantStatus[]).map(s => (
            <div key={s} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="text-xs text-[var(--color-text-muted)]">{APPLICANT_STATUS_LABELS[s]}</p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{stageCounts[s]}</p>
            </div>
          ))}
        </div>
      )}

      {/* Job Postings List */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="flex-1 text-base font-semibold text-[var(--color-text)]">
            <Briefcase className="mr-2 inline h-5 w-5 text-[var(--color-primary)]" />
            Lowongan Kerja
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              className="w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-1.5 pl-8 pr-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              placeholder="Cari lowongan..."
              value={jobSearch}
              onChange={e => setJobSearch(e.target.value)}
            />
          </div>
          <select
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as JobStatus | 'ALL')}
          >
            <option value="ALL">Semua Status</option>
            {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map(s => (
              <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {jobsLoading ? (
          <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">Memuat...</p>
        ) : filteredJobs.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">Belum ada lowongan</p>
        ) : (
          <div className="space-y-2">
            {filteredJobs.map(job => (
              <div
                key={job.id}
                onClick={() => setSelectedJob(prev => prev?.id === job.id ? null : job)}
                className={cn(
                  'cursor-pointer rounded-lg border p-4 transition-colors hover:border-[var(--color-primary)]',
                  selectedJob?.id === job.id
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-raised)]'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-[var(--color-text)]">{job.title}</span>
                      <JobStatusBadge status={job.status} />
                      <span className="text-xs text-[var(--color-text-muted)]">{JOB_TYPE_LABELS[job.type]}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{job.department}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.status === 'OPEN' && (
                      <button
                        onClick={e => { e.stopPropagation(); closeJobMutation.mutate(job.id) }}
                        className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
                      >
                        Tutup
                      </button>
                    )}
                    {selectedJob?.id === job.id && (
                      <button
                        onClick={e => { e.stopPropagation(); setShowApplicantForm(true) }}
                        className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)]"
                      >
                        <Plus className="h-3 w-3" />
                        Pelamar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Kanban Pipeline */}
      {selectedJob && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              Pipeline — {selectedJob.title}
            </h2>
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <User className="h-4 w-4" />
              <span>{applicants.length} pelamar</span>
              {applicants.length > 0 && (
                <span className="text-[var(--color-text-muted)]">
                  &middot; Offer diterima: {offerRate}%
                </span>
              )}
            </div>
          </div>
          {appsLoading ? (
            <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">Memuat pelamar...</p>
          ) : (
            <KanbanBoard applicants={applicants} onMove={handleMove} />
          )}
        </div>
      )}

      {/* Modals */}
      {showJobForm && (
        <JobFormModal
          storeId={storeId}
          onClose={() => setShowJobForm(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['hr-job-postings'] })}
        />
      )}
      {showApplicantForm && selectedJob && (
        <ApplicantFormModal
          storeId={storeId}
          jobId={selectedJob.id}
          onClose={() => setShowApplicantForm(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['hr-applicants'] })}
        />
      )}
    </div>
  )
}
