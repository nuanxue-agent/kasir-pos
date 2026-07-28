'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Plus,
  X,
  Clock,
  CheckCircle,
  MessageSquare,
  ChevronDown,
  FileText,
  Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  isValidStatusTransition,
  getAllowedNextStatuses,
  type GrievanceType,
  type GrievanceStatus,
  type GrievanceSeverity,
} from '@/lib/grievance'

// ─── exported for unit tests ──────────────────────────────────────────────────
export { isValidStatusTransition, getAllowedNextStatuses }
export type { GrievanceType, GrievanceStatus, GrievanceSeverity }

interface GrievanceClientProps {
  storeId: string
}

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 transition-all'

const selectCls = inputCls + ' cursor-pointer'

const TYPE_CONFIG: Record<GrievanceType, { label: string; pill: string; icon: React.ReactNode }> = {
  GRIEVANCE:    { label: 'Keluhan',   pill: 'bg-blue-50 text-blue-700 border border-blue-200',     icon: <FileText className="w-3.5 h-3.5" /> },
  DISCIPLINARY: { label: 'Disiplin',  pill: 'bg-orange-50 text-orange-700 border border-orange-200', icon: <Shield className="w-3.5 h-3.5" /> },
}

const STATUS_CONFIG: Record<GrievanceStatus, { label: string; pill: string }> = {
  OPEN:         { label: 'Terbuka',       pill: 'bg-blue-50 text-blue-700 border border-blue-200' },
  UNDER_REVIEW: { label: 'Ditinjau',      pill: 'bg-amber-50 text-amber-700 border border-amber-200' },
  RESOLVED:     { label: 'Terselesaikan', pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  CLOSED:       { label: 'Ditutup',       pill: 'bg-stone-100 text-stone-500 border border-stone-200' },
}

const SEVERITY_CONFIG: Record<GrievanceSeverity, { label: string; pill: string }> = {
  LOW:    { label: 'Rendah',  pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  MEDIUM: { label: 'Sedang',  pill: 'bg-amber-50 text-amber-700 border border-amber-200' },
  HIGH:   { label: 'Tinggi',  pill: 'bg-red-50 text-red-700 border border-red-200' },
}

const STATUS_LABELS: Record<GrievanceStatus, string> = {
  OPEN: 'Terbuka', UNDER_REVIEW: 'Ditinjau', RESOLVED: 'Terselesaikan', CLOSED: 'Ditutup',
}

export default function GrievanceClient({ storeId }: GrievanceClientProps) {
  const qc = useQueryClient()
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selectedCase, setSelectedCase] = useState<any>(null)

  const grievancesQ = useQuery({
    queryKey: ['grievances', storeId, filterType, filterStatus, filterSeverity],
    queryFn: async () => {
      const p = new URLSearchParams({ storeId })
      if (filterType) p.set('type', filterType)
      if (filterStatus) p.set('status', filterStatus)
      if (filterSeverity) p.set('severity', filterSeverity)
      const res = await fetch(`/api/hr/grievances?${p}`)
      const json = await res.json() as any
      return (json.data ?? []) as any[]
    },
  })

  const updateStatusMut = useMutation({
    mutationFn: async ({ id, status, resolution, resolvedBy }: {
      id: string; status: string; resolution?: string; resolvedBy?: string
    }) => {
      const res = await fetch(`/api/hr/grievances/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolution, resolvedBy }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
    },
    onSuccess: () => {
      toast.success('Status kasus diperbarui')
      qc.invalidateQueries({ queryKey: ['grievances', storeId] })
    },
    onError: (e: any) => toast.error(e.message),
  })

  const stats = {
    open: (grievancesQ.data ?? []).filter((g: any) => g.status === 'OPEN').length,
    underReview: (grievancesQ.data ?? []).filter((g: any) => g.status === 'UNDER_REVIEW').length,
    high: (grievancesQ.data ?? []).filter((g: any) => g.severity === 'HIGH').length,
    total: (grievancesQ.data ?? []).length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Keluhan & Disiplin</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">Kelola kasus keluhan dan disiplin karyawan</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Kasus Baru
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Kasus',   value: stats.total,       cls: 'text-[var(--text-1)]' },
          { label: 'Terbuka',       value: stats.open,        cls: 'text-blue-600' },
          { label: 'Ditinjau',      value: stats.underReview, cls: 'text-amber-600' },
          { label: 'Prioritas Tinggi', value: stats.high,     cls: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 text-center">
            <p className={cn('text-2xl font-bold', s.cls)}>{s.value}</p>
            <p className="text-xs text-[var(--text-3)] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className={cn(selectCls, 'w-44')}>
          <option value="">Semua Tipe</option>
          <option value="GRIEVANCE">Keluhan</option>
          <option value="DISCIPLINARY">Disiplin</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={cn(selectCls, 'w-44')}>
          <option value="">Semua Status</option>
          <option value="OPEN">Terbuka</option>
          <option value="UNDER_REVIEW">Ditinjau</option>
          <option value="RESOLVED">Terselesaikan</option>
          <option value="CLOSED">Ditutup</option>
        </select>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className={cn(selectCls, 'w-40')}>
          <option value="">Semua Tingkat</option>
          <option value="LOW">Rendah</option>
          <option value="MEDIUM">Sedang</option>
          <option value="HIGH">Tinggi</option>
        </select>
      </div>

      {/* Case list */}
      {grievancesQ.isLoading ? (
        <div className="flex items-center justify-center py-16 text-[var(--text-3)]">
          <Clock className="w-5 h-5 animate-spin mr-2" /> Memuat...
        </div>
      ) : (grievancesQ.data ?? []).length === 0 ? (
        <div className="text-center py-16 text-[var(--text-3)]">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Belum ada kasus tercatat</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(grievancesQ.data ?? []).map((g: any) => {
            const typeCfg = TYPE_CONFIG[g.type as GrievanceType] ?? TYPE_CONFIG.GRIEVANCE
            const stCfg = STATUS_CONFIG[g.status as GrievanceStatus] ?? STATUS_CONFIG.OPEN
            const sevCfg = SEVERITY_CONFIG[g.severity as GrievanceSeverity] ?? SEVERITY_CONFIG.LOW
            const allowed = getAllowedNextStatuses(g.status as GrievanceStatus)
            return (
              <div key={g.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', typeCfg.pill)}>
                        {typeCfg.icon}{typeCfg.label}
                      </span>
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', sevCfg.pill)}>{sevCfg.label}</span>
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', stCfg.pill)}>{stCfg.label}</span>
                    </div>
                    <p className="text-sm font-semibold text-[var(--text-1)] truncate">{g.subject}</p>
                    {g.description && <p className="text-xs text-[var(--text-2)] line-clamp-2">{g.description}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--text-3)]">
                      <span>Karyawan: {g.employeeName ?? g.employeeId}</span>
                      <span>Dilaporkan: {g.reportedBy}</span>
                      <span>{g.createdAt?.slice(0, 10)}</span>
                    </div>
                    {g.resolution && (
                      <div className="flex items-start gap-1.5 mt-1">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-[var(--text-2)]">{g.resolution}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedCase(g)}
                      className="flex items-center gap-1 text-xs text-[var(--text-2)] hover:text-violet-600 bg-[var(--bg-subtle)] px-2.5 py-1 rounded-lg border border-[var(--border)] transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" /> Catatan
                    </button>
                    {allowed.length > 0 && (
                      <div className="relative group">
                        <button className="flex items-center gap-1 text-xs text-[var(--text-2)] hover:text-[var(--text-1)] bg-[var(--bg-subtle)] px-2.5 py-1 rounded-lg border border-[var(--border)] transition-colors">
                          Ubah Status <ChevronDown className="w-3 h-3" />
                        </button>
                        <div className="absolute right-0 top-full mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg z-10 hidden group-hover:block min-w-[160px]">
                          {allowed.map(st => (
                            <button
                              key={st}
                              onClick={() => updateStatusMut.mutate({ id: g.id, status: st })}
                              disabled={updateStatusMut.isPending}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-subtle)] rounded-xl"
                            >
                              → {STATUS_LABELS[st]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* New case modal */}
      {showForm && (
        <GrievanceFormModal
          storeId={storeId}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['grievances', storeId] })
          }}
        />
      )}

      {/* Timeline / notes modal */}
      {selectedCase && (
        <CaseNotesModal
          storeId={storeId}
          grievance={selectedCase}
          onClose={() => setSelectedCase(null)}
        />
      )}
    </div>
  )
}

// ─── New Case Form Modal ──────────────────────────────────────────────────────
function GrievanceFormModal({
  storeId,
  onClose,
  onSuccess,
}: {
  storeId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    employeeId: '',
    type: 'GRIEVANCE' as GrievanceType,
    subject: '',
    description: '',
    severity: 'LOW' as GrievanceSeverity,
    reportedBy: '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.employeeId || !form.subject || !form.reportedBy) {
      toast.error('ID karyawan, subjek, dan pelapor wajib diisi')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/hr/grievances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...form }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Kasus berhasil dicatat')
      onSuccess()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[var(--text-1)]">Kasus Baru</h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)]"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">ID Karyawan *</label>
              <input value={form.employeeId} onChange={e => set('employeeId', e.target.value)} placeholder="emp_..." className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">Tipe *</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className={selectCls}>
                <option value="GRIEVANCE">Keluhan</option>
                <option value="DISCIPLINARY">Disiplin</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-2)]">Subjek *</label>
            <input value={form.subject} onChange={e => set('subject', e.target.value)} placeholder="Ringkasan kasus..." className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-2)]">Deskripsi</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="Detail lengkap kasus..." className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">Tingkat Keparahan</label>
              <select value={form.severity} onChange={e => set('severity', e.target.value)} className={selectCls}>
                <option value="LOW">Rendah</option>
                <option value="MEDIUM">Sedang</option>
                <option value="HIGH">Tinggi</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">Dilaporkan oleh *</label>
              <input value={form.reportedBy} onChange={e => set('reportedBy', e.target.value)} placeholder="Nama pelapor..." className={inputCls} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-2)] hover:text-[var(--text-1)] border border-[var(--border)] rounded-xl transition-colors">Batal</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium bg-violet-500 hover:bg-violet-600 text-white rounded-xl transition-colors disabled:opacity-60">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Case Notes / Timeline Modal ──────────────────────────────────────────────
function CaseNotesModal({
  storeId,
  grievance,
  onClose,
}: {
  storeId: string
  grievance: any
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [noteText, setNoteText] = useState('')
  const [authorId, setAuthorId] = useState('')
  const [saving, setSaving] = useState(false)

  const notesQ = useQuery({
    queryKey: ['grievance-notes', grievance.id],
    queryFn: async () => {
      const res = await fetch(`/api/hr/grievances/${grievance.id}/notes?storeId=${storeId}`)
      const json = await res.json() as any
      return (json.data ?? []) as any[]
    },
  })

  const addNote = async () => {
    if (!noteText.trim() || !authorId.trim()) {
      toast.error('Catatan dan ID penulis wajib diisi')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/hr/grievances/${grievance.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, authorId, note: noteText.trim() }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Catatan ditambahkan')
      setNoteText('')
      qc.invalidateQueries({ queryKey: ['grievance-notes', grievance.id] })
    } finally {
      setSaving(false)
    }
  }

  const typeCfg = TYPE_CONFIG[grievance.type as GrievanceType] ?? TYPE_CONFIG.GRIEVANCE
  const stCfg = STATUS_CONFIG[grievance.status as GrievanceStatus] ?? STATUS_CONFIG.OPEN

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', typeCfg.pill)}>
                {typeCfg.icon}{typeCfg.label}
              </span>
              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', stCfg.pill)}>{stCfg.label}</span>
            </div>
            <h2 className="font-semibold text-[var(--text-1)] text-sm">{grievance.subject}</h2>
          </div>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)]"><X className="w-5 h-5" /></button>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
          {notesQ.isLoading ? (
            <div className="flex items-center justify-center py-8 text-[var(--text-3)]">
              <Clock className="w-4 h-4 animate-spin mr-2" /> Memuat...
            </div>
          ) : (notesQ.data ?? []).length === 0 ? (
            <div className="text-center py-8 text-[var(--text-3)]">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Belum ada catatan</p>
            </div>
          ) : (
            (notesQ.data ?? []).map((n: any) => (
              <div key={n.id} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-bold shrink-0">
                  {(n.authorId ?? '?')[0]?.toUpperCase()}
                </div>
                <div className="flex-1 bg-[var(--bg-subtle)] rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[var(--text-1)]">{n.authorId}</span>
                    <span className="text-xs text-[var(--text-3)]">{n.createdAt?.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                  <p className="text-sm text-[var(--text-2)]">{n.note}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add note */}
        <div className="p-5 border-t border-[var(--border)] space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-2)]">ID Penulis *</label>
            <input value={authorId} onChange={e => setAuthorId(e.target.value)} placeholder="emp_..." className={inputCls} />
          </div>
          <div className="flex gap-2">
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={2}
              placeholder="Tambah catatan atau komentar..."
              className={cn(inputCls, 'flex-1 resize-none')}
            />
            <button
              onClick={addNote}
              disabled={saving}
              className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60 self-end"
            >
              Kirim
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
