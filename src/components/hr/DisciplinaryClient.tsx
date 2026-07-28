'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Plus,
  X,
  CheckCircle,
  Clock,
  Shield,
  FileWarning,
  UserX,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  getActionSeverity,
  shouldEscalateToSuspension,
  recommendNextAction,
  type ActionType,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentType,
} from '@/lib/disciplinary'

// ─── exported for unit tests ─────────────────────────────────────────────────
export { getActionSeverity, shouldEscalateToSuspension, recommendNextAction }
export type { ActionType, IncidentSeverity, IncidentStatus, IncidentType }

interface DisciplinaryClientProps {
  storeId: string
}

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const selectCls = inputCls + ' cursor-pointer'

const ACTION_CONFIG: Record<ActionType, { label: string; pill: string; icon: React.ReactNode }> = {
  VERBAL_WARNING:  { label: 'Peringatan Lisan',    pill: 'bg-amber-50 text-amber-700 border border-amber-200',   icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  WRITTEN_WARNING: { label: 'Peringatan Tertulis', pill: 'bg-orange-50 text-orange-700 border border-orange-200', icon: <FileWarning className="w-3.5 h-3.5" /> },
  SUSPENSION:      { label: 'Skorsing',            pill: 'bg-red-50 text-red-700 border border-red-200',          icon: <Shield className="w-3.5 h-3.5" /> },
  TERMINATION:     { label: 'PHK',                 pill: 'bg-rose-100 text-rose-800 border border-rose-300',      icon: <UserX className="w-3.5 h-3.5" /> },
}

const SEVERITY_CONFIG: Record<IncidentSeverity, { label: string; pill: string }> = {
  LOW:    { label: 'Rendah',  pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  MEDIUM: { label: 'Sedang',  pill: 'bg-amber-50 text-amber-700 border border-amber-200' },
  HIGH:   { label: 'Tinggi',  pill: 'bg-red-50 text-red-700 border border-red-200' },
}

const STATUS_CONFIG: Record<IncidentStatus, { label: string; pill: string }> = {
  OPEN:          { label: 'Terbuka',     pill: 'bg-blue-50 text-blue-700 border border-blue-200' },
  INVESTIGATING: { label: 'Investigasi', pill: 'bg-amber-50 text-amber-700 border border-amber-200' },
  RESOLVED:      { label: 'Selesai',     pill: 'bg-stone-100 text-stone-500 border border-stone-200' },
}

type Tab = 'actions' | 'incidents'

export default function DisciplinaryClient({ storeId }: DisciplinaryClientProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('actions')
  const [showActionForm, setShowActionForm] = useState(false)
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // ── Disciplinary actions ──────────────────────────────────────────────────
  const actionsQ = useQuery({
    queryKey: ['disciplinary', storeId, filterEmployee, filterType],
    queryFn: async () => {
      const p = new URLSearchParams({ storeId })
      if (filterEmployee) p.set('employeeId', filterEmployee)
      if (filterType) p.set('type', filterType)
      const res = await fetch(`/api/hr/disciplinary?${p}`)
      const json = await res.json() as any
      return (json.data ?? []) as any[]
    },
  })

  // ── Incidents ─────────────────────────────────────────────────────────────
  const incidentsQ = useQuery({
    queryKey: ['incidents', storeId, filterSeverity, filterStatus],
    queryFn: async () => {
      const p = new URLSearchParams({ storeId })
      if (filterSeverity) p.set('severity', filterSeverity)
      if (filterStatus) p.set('status', filterStatus)
      const res = await fetch(`/api/hr/incidents?${p}`)
      const json = await res.json() as any
      return (json.data ?? []) as any[]
    },
  })

  const acknowledgeMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hr/disciplinary/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge' }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
    },
    onSuccess: () => {
      toast.success('Tindakan dikonfirmasi')
      qc.invalidateQueries({ queryKey: ['disciplinary', storeId] })
    },
    onError: (e: any) => toast.error(e.message),
  })

  const updateIncidentMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/hr/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
    },
    onSuccess: () => {
      toast.success('Status insiden diperbarui')
      qc.invalidateQueries({ queryKey: ['incidents', storeId] })
    },
    onError: (e: any) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Disiplin & Insiden</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">Kelola tindakan disiplin dan log insiden karyawan</p>
        </div>
        <button
          onClick={() => tab === 'actions' ? setShowActionForm(true) : setShowIncidentForm(true)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          {tab === 'actions' ? 'Tindakan Baru' : 'Insiden Baru'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--bg-subtle)] p-1 rounded-xl w-fit">
        {(['actions', 'incidents'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-all',
              tab === t
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
            )}
          >
            {t === 'actions' ? 'Tindakan Disiplin' : 'Log Insiden'}
          </button>
        ))}
      </div>

      {/* Actions tab */}
      {tab === 'actions' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className={cn(selectCls, 'w-48')}>
              <option value="">Semua Tipe</option>
              <option value="VERBAL_WARNING">Peringatan Lisan</option>
              <option value="WRITTEN_WARNING">Peringatan Tertulis</option>
              <option value="SUSPENSION">Skorsing</option>
              <option value="TERMINATION">PHK</option>
            </select>
          </div>

          {actionsQ.isLoading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-3)]">
              <Clock className="w-5 h-5 animate-spin mr-2" /> Memuat...
            </div>
          ) : actionsQ.data?.length === 0 ? (
            <div className="text-center py-16 text-[var(--text-3)]">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Belum ada tindakan disiplin</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(actionsQ.data ?? []).map((a: any) => {
                const cfg = ACTION_CONFIG[a.type as ActionType] ?? ACTION_CONFIG.VERBAL_WARNING
                return (
                  <div key={a.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', cfg.pill)}>
                          {cfg.icon}{cfg.label}
                        </span>
                        <span className="text-sm font-semibold text-[var(--text-1)]">{a.employeeName ?? a.employeeId}</span>
                        <span className="text-xs text-[var(--text-3)]">{a.date}</span>
                      </div>
                      <p className="text-sm text-[var(--text-2)]"><span className="font-medium">Alasan:</span> {a.reason}</p>
                      {a.description && <p className="text-xs text-[var(--text-3)]">{a.description}</p>}
                      <p className="text-xs text-[var(--text-3)]">Diterbitkan oleh: {a.issuedBy}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.acknowledged ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                          <CheckCircle className="w-3.5 h-3.5" /> Dikonfirmasi
                        </span>
                      ) : (
                        <button
                          onClick={() => acknowledgeMut.mutate(a.id)}
                          disabled={acknowledgeMut.isPending}
                          className="text-xs text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full font-medium transition-colors"
                        >
                          Konfirmasi
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Incidents tab */}
      {tab === 'incidents' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className={cn(selectCls, 'w-40')}>
              <option value="">Semua Tingkat</option>
              <option value="LOW">Rendah</option>
              <option value="MEDIUM">Sedang</option>
              <option value="HIGH">Tinggi</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={cn(selectCls, 'w-44')}>
              <option value="">Semua Status</option>
              <option value="OPEN">Terbuka</option>
              <option value="INVESTIGATING">Investigasi</option>
              <option value="RESOLVED">Selesai</option>
            </select>
          </div>

          {incidentsQ.isLoading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-3)]">
              <Clock className="w-5 h-5 animate-spin mr-2" /> Memuat...
            </div>
          ) : incidentsQ.data?.length === 0 ? (
            <div className="text-center py-16 text-[var(--text-3)]">
              <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Belum ada insiden tercatat</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(incidentsQ.data ?? []).map((inc: any) => {
                const sevCfg = SEVERITY_CONFIG[inc.severity as IncidentSeverity] ?? SEVERITY_CONFIG.LOW
                const stCfg = STATUS_CONFIG[inc.status as IncidentStatus] ?? STATUS_CONFIG.OPEN
                return (
                  <div key={inc.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', sevCfg.pill)}>{sevCfg.label}</span>
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', stCfg.pill)}>{stCfg.label}</span>
                        <span className="text-xs text-[var(--text-3)]">{inc.type}</span>
                        <span className="text-xs text-[var(--text-3)]">{inc.createdAt?.slice(0, 10)}</span>
                      </div>
                      {inc.status !== 'RESOLVED' && (
                        <div className="relative group">
                          <button className="flex items-center gap-1 text-xs text-[var(--text-2)] hover:text-[var(--text-1)] bg-[var(--bg-subtle)] px-2.5 py-1 rounded-lg border border-[var(--border)] transition-colors">
                            Ubah Status <ChevronDown className="w-3 h-3" />
                          </button>
                          <div className="absolute right-0 top-full mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg z-10 hidden group-hover:block min-w-[140px]">
                            {inc.status === 'OPEN' && (
                              <button onClick={() => updateIncidentMut.mutate({ id: inc.id, status: 'INVESTIGATING' })}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-subtle)] rounded-xl">
                                → Investigasi
                              </button>
                            )}
                            <button onClick={() => updateIncidentMut.mutate({ id: inc.id, status: 'RESOLVED' })}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-subtle)] rounded-xl">
                              → Selesai
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-2)]">{inc.description || '—'}</p>
                    <p className="text-xs text-[var(--text-3)]">Dilaporkan oleh: {inc.reportedBy}</p>
                    {Array.isArray(inc.involvedEmployees) && inc.involvedEmployees.length > 0 && (
                      <p className="text-xs text-[var(--text-3)]">Karyawan terlibat: {inc.involvedEmployees.join(', ')}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* New Action Modal */}
      {showActionForm && (
        <ActionFormModal
          storeId={storeId}
          onClose={() => setShowActionForm(false)}
          onSuccess={() => {
            setShowActionForm(false)
            qc.invalidateQueries({ queryKey: ['disciplinary', storeId] })
          }}
        />
      )}

      {/* New Incident Modal */}
      {showIncidentForm && (
        <IncidentFormModal
          storeId={storeId}
          onClose={() => setShowIncidentForm(false)}
          onSuccess={() => {
            setShowIncidentForm(false)
            qc.invalidateQueries({ queryKey: ['incidents', storeId] })
          }}
        />
      )}
    </div>
  )
}

// ─── Action Form Modal ────────────────────────────────────────────────────────
function ActionFormModal({
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
    type: 'VERBAL_WARNING' as ActionType,
    reason: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
    issuedBy: '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.employeeId || !form.reason || !form.issuedBy) {
      toast.error('ID karyawan, alasan, dan penerbit wajib diisi')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/hr/disciplinary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...form }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Tindakan disiplin dicatat')
      onSuccess()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[var(--text-1)]">Tindakan Disiplin Baru</h2>
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
                <option value="VERBAL_WARNING">Peringatan Lisan</option>
                <option value="WRITTEN_WARNING">Peringatan Tertulis</option>
                <option value="SUSPENSION">Skorsing</option>
                <option value="TERMINATION">PHK</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-2)]">Alasan *</label>
            <input value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="Alasan tindakan..." className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-2)]">Deskripsi</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="Detail kejadian..." className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">Tanggal *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">Diterbitkan oleh *</label>
              <input value={form.issuedBy} onChange={e => set('issuedBy', e.target.value)} placeholder="Nama manajer..." className={inputCls} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-2)] hover:text-[var(--text-1)] border border-[var(--border)] rounded-xl transition-colors">Batal</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors disabled:opacity-60">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Incident Form Modal ──────────────────────────────────────────────────────
function IncidentFormModal({
  storeId,
  onClose,
  onSuccess,
}: {
  storeId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    reportedBy: '',
    involvedEmployees: '',
    type: 'OTHER' as IncidentType,
    description: '',
    severity: 'LOW' as IncidentSeverity,
  })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.reportedBy) {
      toast.error('Nama pelapor wajib diisi')
      return
    }
    setSaving(true)
    try {
      const involvedEmployees = form.involvedEmployees
        ? form.involvedEmployees.split(',').map(s => s.trim()).filter(Boolean)
        : []
      const res = await fetch(`/api/hr/incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...form, involvedEmployees }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Insiden dicatat')
      onSuccess()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[var(--text-1)]">Laporan Insiden Baru</h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)]"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">Dilaporkan oleh *</label>
              <input value={form.reportedBy} onChange={e => set('reportedBy', e.target.value)} placeholder="Nama pelapor..." className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">Tipe Insiden</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className={selectCls}>
                <option value="MISCONDUCT">Pelanggaran Etika</option>
                <option value="SAFETY">Keselamatan</option>
                <option value="POLICY_VIOLATION">Pelanggaran Kebijakan</option>
                <option value="OTHER">Lainnya</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-2)]">Karyawan Terlibat (pisahkan dengan koma)</label>
            <input value={form.involvedEmployees} onChange={e => set('involvedEmployees', e.target.value)} placeholder="emp_123, emp_456..." className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-2)]">Deskripsi</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="Kronologi kejadian..." className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-2)]">Tingkat Keparahan</label>
            <select value={form.severity} onChange={e => set('severity', e.target.value)} className={selectCls}>
              <option value="LOW">Rendah</option>
              <option value="MEDIUM">Sedang</option>
              <option value="HIGH">Tinggi</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-2)] hover:text-[var(--text-1)] border border-[var(--border)] rounded-xl transition-colors">Batal</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors disabled:opacity-60">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}
