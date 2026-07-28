'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Star,
  Plus,
  X,
  Users,
  BarChart2,
  CheckCircle,
  Clock,
  RefreshCw,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import type { ReviewCycle, ReviewCycleStatus, ReviewCycleType, PeerReviewScores } from '@/lib/performance-review'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PerformanceReviewClientV2Props {
  storeId: string
  userRole?: string
  currentEmployeeId?: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const SCORE_LABELS: Record<number, string> = {
  1: 'Perlu Perbaikan',
  2: 'Di Bawah Ekspektasi',
  3: 'Memenuhi Ekspektasi',
  4: 'Melampaui Ekspektasi',
  5: 'Luar Biasa',
}

const PEER_DIMENSIONS: Array<{ key: keyof PeerReviewScores; label: string }> = [
  { key: 'communication', label: 'Komunikasi' },
  { key: 'teamwork', label: 'Kerja Tim' },
  { key: 'skills', label: 'Keahlian' },
  { key: 'attitude', label: 'Sikap Kerja' },
]

const CYCLE_STATUS_CONFIG: Record<ReviewCycleStatus, { label: string; pill: string }> = {
  DRAFT: { label: 'Draft', pill: 'bg-amber-50 text-amber-600 border border-amber-200' },
  ACTIVE: { label: 'Aktif', pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
  CLOSED: { label: 'Selesai', pill: 'bg-stone-100 text-stone-500 border border-stone-200' },
}

const CYCLE_TYPE_LABEL: Record<ReviewCycleType, string> = {
  ANNUAL: 'Tahunan',
  QUARTERLY: 'Kuartalan',
  PEER: '360 Derajat',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── StarRating ───────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readonly,
}: {
  value: number
  onChange?: (v: number) => void
  readonly?: boolean
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n)}
          className={cn('transition-transform', readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110')}
        >
          <Star
            size={16}
            className={cn(n <= value ? 'fill-amber-400 text-amber-400' : 'text-stone-300')}
          />
        </button>
      ))}
      <span className="ml-1.5 text-xs text-[var(--text-2)]">{SCORE_LABELS[value] ?? ''}</span>
    </div>
  )
}

// ─── CycleForm ────────────────────────────────────────────────────────────────

function CycleForm({
  storeId,
  onClose,
  onSaved,
}: {
  storeId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    type: 'PEER' as ReviewCycleType,
    startDate: '',
    endDate: '',
  })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.startDate || !form.endDate) {
      toast.error('Semua field wajib diisi')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/hr/review-cycles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...form }),
      })
      if (!res.ok) {
        const d = await res.json() as any
        toast.error(d.error ?? 'Gagal menyimpan')
        return
      }
      toast.success('Siklus berhasil dibuat')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Nama Siklus</label>
        <input
          className={inputCls}
          placeholder="mis. Review Q1 2025"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Tipe</label>
        <select
          className={inputCls}
          value={form.type}
          onChange={e => setForm(f => ({ ...f, type: e.target.value as ReviewCycleType }))}
        >
          <option value="PEER">360 Derajat</option>
          <option value="QUARTERLY">Kuartalan</option>
          <option value="ANNUAL">Tahunan</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Tanggal Mulai</label>
          <input
            type="date"
            className={inputCls}
            value={form.startDate}
            onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Tanggal Selesai</label>
          <input
            type="date"
            className={inputCls}
            value={form.endDate}
            onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-xl border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm rounded-xl bg-amber-400 text-white font-medium hover:bg-amber-500 disabled:opacity-50"
        >
          {saving ? 'Menyimpan...' : 'Buat Siklus'}
        </button>
      </div>
    </form>
  )
}

// ─── PeerReviewForm ───────────────────────────────────────────────────────────

function PeerReviewForm({
  cycleId,
  storeId,
  employees,
  currentEmployeeId,
  onClose,
  onSaved,
}: {
  cycleId: string
  storeId: string
  employees: any[]
  currentEmployeeId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    revieweeId: '',
    scores: { communication: 3, teamwork: 3, skills: 3, attitude: 3 } as PeerReviewScores,
    comments: '',
    isSelf: false,
  })
  const [saving, setSaving] = useState(false)

  const reviewerId = currentEmployeeId ?? ''
  const overallScore =
    Math.round(
      (Object.values(form.scores).reduce((a: number, b: number) => a + b, 0) / 4) * 10,
    ) / 10

  async function submit(e: React.FormEvent, submitNow: boolean) {
    e.preventDefault()
    if (!form.revieweeId) { toast.error('Pilih karyawan yang dinilai'); return }
    if (!reviewerId) { toast.error('ID reviewer tidak ditemukan'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/hr/review-cycles/${cycleId}/peer-reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewerId,
          revieweeId: form.revieweeId,
          storeId,
          scores: form.scores,
          comments: form.comments,
          submit: submitNow,
        }),
      })
      if (!res.ok) {
        const d = await res.json() as any
        toast.error(d.error ?? 'Gagal menyimpan')
        return
      }
      toast.success(submitNow ? 'Penilaian dikirim' : 'Draft disimpan')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const reviewableEmployees = form.isSelf
    ? employees.filter(e => e.id === currentEmployeeId)
    : employees.filter(e => e.id !== currentEmployeeId)

  return (
    <form className="space-y-5">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-[var(--text-2)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.isSelf}
            onChange={e => setForm(f => ({ ...f, isSelf: e.target.checked, revieweeId: '' }))}
            className="rounded"
          />
          Penilaian Diri (Self-Assessment)
        </label>
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
          {form.isSelf ? 'Karyawan (diri sendiri)' : 'Karyawan yang Dinilai'}
        </label>
        <select
          className={inputCls}
          value={form.revieweeId}
          onChange={e => setForm(f => ({ ...f, revieweeId: e.target.value }))}
        >
          <option value="">-- Pilih Karyawan --</option>
          {reviewableEmployees.map((emp: any) => (
            <option key={emp.id} value={emp.id}>
              {emp.name} — {emp.position ?? 'Staff'}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">Penilaian (1–5)</p>
        {PEER_DIMENSIONS.map(dim => (
          <div key={dim.key} className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-1)] w-32">{dim.label}</span>
            <StarRating
              value={form.scores[dim.key]}
              onChange={v => setForm(f => ({ ...f, scores: { ...f.scores, [dim.key]: v } }))}
            />
          </div>
        ))}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
          <span className="text-sm font-semibold text-[var(--text-1)]">Rata-rata</span>
          <span className="text-base font-bold text-amber-500">{overallScore.toFixed(1)} / 5</span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Komentar</label>
        <textarea
          className={cn(inputCls, 'resize-none')}
          rows={3}
          placeholder="Tuliskan catatan atau masukan..."
          value={form.comments}
          onChange={e => setForm(f => ({ ...f, comments: e.target.value }))}
        />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)]">
          Batal
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={e => submit(e as any, false)}
          className="px-4 py-2 text-sm rounded-xl border border-amber-300 text-amber-600 hover:bg-amber-50 disabled:opacity-50"
        >
          Simpan Draft
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={e => submit(e as any, true)}
          className="px-4 py-2 text-sm rounded-xl bg-amber-400 text-white font-medium hover:bg-amber-500 disabled:opacity-50"
        >
          {saving ? 'Mengirim...' : 'Kirim Penilaian'}
        </button>
      </div>
    </form>
  )
}

// ─── ResultsPanel ─────────────────────────────────────────────────────────────

function ResultsPanel({ cycleId }: { cycleId: string }) {
  const { data: results = [], isLoading } = useQuery<any[]>({
    queryKey: ['review-results', cycleId],
    queryFn: async () => {
      const r = await fetch(`/api/hr/review-cycles/${cycleId}/results`)
      if (!r.ok) return []
      return r.json() as Promise<any[]>
    },
  })

  if (isLoading) return (
    <div className="flex items-center gap-2 py-8 text-[var(--text-2)] text-sm justify-center">
      <RefreshCw size={14} className="animate-spin" /> Memuat hasil...
    </div>
  )

  if (results.length === 0) return (
    <p className="text-sm text-[var(--text-2)] text-center py-8">Belum ada penilaian yang dikirim.</p>
  )

  return (
    <div className="space-y-3">
      {results.map((r: any) => (
        <div key={r.revieweeId} className="bg-[var(--bg-subtle)] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[var(--text-1)] text-sm">{r.revieweeName ?? r.revieweeId}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-2)]">{r.reviewerCount} reviewer</span>
              <span className="text-base font-bold text-amber-500">{r.overall.toFixed(2)} / 5</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PEER_DIMENSIONS.map(dim => (
              <div key={dim.key} className="flex items-center justify-between bg-[var(--bg-card)] rounded-xl px-3 py-2">
                <span className="text-xs text-[var(--text-2)]">{dim.label}</span>
                <div className="flex items-center gap-1">
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  <span className="text-xs font-semibold text-[var(--text-1)]">{r[dim.key]?.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PerformanceReviewClientV2({
  storeId,
  userRole,
  currentEmployeeId,
}: PerformanceReviewClientV2Props) {
  const qc = useQueryClient()
  const [showCycleForm, setShowCycleForm] = useState(false)
  const [showPeerForm, setShowPeerForm] = useState(false)
  const [selectedCycle, setSelectedCycle] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'reviews' | 'results'>('reviews')

  const isManager = userRole === 'OWNER' || userRole === 'MANAGER'

  const { data: cycles = [], isLoading: cyclesLoading } = useQuery<any[]>({
    queryKey: ['review-cycles', storeId],
    queryFn: async () => {
      const r = await fetch(`/api/hr/review-cycles?storeId=${storeId}`)
      if (!r.ok) return []
      return r.json() as Promise<any[]>
    },
  })

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees', storeId],
    queryFn: async () => {
      const r = await fetch(`/api/hr/employees?storeId=${storeId}`)
      if (!r.ok) return []
      return r.json() as Promise<any[]>
    },
  })

  const { data: peerReviews = [], isLoading: reviewsLoading } = useQuery<any[]>({
    queryKey: ['peer-reviews', selectedCycle?.id],
    enabled: !!selectedCycle,
    queryFn: async () => {
      const r = await fetch(`/api/hr/review-cycles/${selectedCycle.id}/peer-reviews`)
      if (!r.ok) return []
      return r.json() as Promise<any[]>
    },
  })

  async function updateCycleStatus(cycleId: string, status: string) {
    const res = await fetch(`/api/hr/review-cycles/${cycleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      const d = await res.json() as any
      toast.error(d.error ?? 'Gagal memperbarui status')
      return
    }
    toast.success('Status siklus diperbarui')
    qc.invalidateQueries({ queryKey: ['review-cycles', storeId] })
    if (selectedCycle?.id === cycleId) {
      setSelectedCycle((c: any) => c ? { ...c, status } : c)
    }
  }

  const completionRate = selectedCycle
    ? Math.round(
        (peerReviews.filter((r: any) => r.submittedAt).length /
          Math.max(peerReviews.length, 1)) *
          100,
      )
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-1)]">Review Kinerja 360°</h2>
          <p className="text-sm text-[var(--text-2)] mt-0.5">
            Penilaian peer, self-assessment, dan agregasi skor per dimensi
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => setShowCycleForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400 text-white text-sm font-medium hover:bg-amber-500 transition-colors"
          >
            <Plus size={16} />
            Buat Siklus
          </button>
        )}
      </div>

      {/* Cycle form modal */}
      {showCycleForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[var(--text-1)]">Buat Siklus Review</h3>
              <button onClick={() => setShowCycleForm(false)}>
                <X size={18} className="text-[var(--text-2)]" />
              </button>
            </div>
            <CycleForm
              storeId={storeId}
              onClose={() => setShowCycleForm(false)}
              onSaved={() => qc.invalidateQueries({ queryKey: ['review-cycles', storeId] })}
            />
          </div>
        </div>
      )}

      {/* Peer review form modal */}
      {showPeerForm && selectedCycle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[var(--text-1)]">Isi Penilaian Peer</h3>
              <button onClick={() => setShowPeerForm(false)}>
                <X size={18} className="text-[var(--text-2)]" />
              </button>
            </div>
            <PeerReviewForm
              cycleId={selectedCycle.id}
              storeId={storeId}
              employees={employees}
              currentEmployeeId={currentEmployeeId}
              onClose={() => setShowPeerForm(false)}
              onSaved={() => qc.invalidateQueries({ queryKey: ['peer-reviews', selectedCycle.id] })}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: cycle list */}
        <div className="lg:col-span-1 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-2)] px-1">Siklus Review</p>
          {cyclesLoading && (
            <div className="flex items-center gap-2 py-6 text-[var(--text-2)] text-sm justify-center">
              <RefreshCw size={14} className="animate-spin" /> Memuat...
            </div>
          )}
          {!cyclesLoading && cycles.length === 0 && (
            <p className="text-sm text-[var(--text-2)] text-center py-6">Belum ada siklus review.</p>
          )}
          {cycles.map((cycle: any) => {
            const cfg = CYCLE_STATUS_CONFIG[cycle.status as ReviewCycleStatus] ?? CYCLE_STATUS_CONFIG.DRAFT
            const isSelected = selectedCycle?.id === cycle.id
            return (
              <button
                key={cycle.id}
                onClick={() => { setSelectedCycle(cycle); setActiveTab('reviews') }}
                className={cn(
                  'w-full text-left rounded-2xl p-3.5 border transition-all',
                  isSelected
                    ? 'border-amber-300 bg-amber-50/40'
                    : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-amber-200',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-[var(--text-1)] truncate">{cycle.name}</p>
                    <p className="text-xs text-[var(--text-2)] mt-0.5">
                      {CYCLE_TYPE_LABEL[cycle.type as ReviewCycleType] ?? cycle.type}
                    </p>
                    <p className="text-xs text-[var(--text-2)] mt-0.5">
                      {fmtDate(cycle.startDate)} — {fmtDate(cycle.endDate)}
                    </p>
                  </div>
                  <span className={cn('shrink-0 text-xs px-2 py-0.5 rounded-full', cfg.pill)}>
                    {cfg.label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Right: cycle detail */}
        <div className="lg:col-span-2">
          {!selectedCycle ? (
            <div className="flex flex-col items-center justify-center h-48 text-[var(--text-2)] gap-2">
              <BarChart2 size={32} className="opacity-30" />
              <p className="text-sm">Pilih siklus untuk melihat detail</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cycle header */}
              <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[var(--text-1)]">{selectedCycle.name}</h3>
                    <p className="text-xs text-[var(--text-2)] mt-0.5">
                      {CYCLE_TYPE_LABEL[selectedCycle.type as ReviewCycleType]} · {fmtDate(selectedCycle.startDate)} — {fmtDate(selectedCycle.endDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isManager && selectedCycle.status === 'DRAFT' && (
                      <button
                        onClick={() => updateCycleStatus(selectedCycle.id, 'ACTIVE')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-emerald-500 text-white hover:bg-emerald-600"
                      >
                        <CheckCircle size={12} /> Aktifkan
                      </button>
                    )}
                    {isManager && selectedCycle.status === 'ACTIVE' && (
                      <button
                        onClick={() => updateCycleStatus(selectedCycle.id, 'CLOSED')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-stone-500 text-white hover:bg-stone-600"
                      >
                        <Clock size={12} /> Tutup Siklus
                      </button>
                    )}
                  </div>
                </div>

                {/* Stats bar */}
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="bg-[var(--bg-subtle)] rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-[var(--text-1)]">{peerReviews.length}</p>
                    <p className="text-xs text-[var(--text-2)]">Total Penilaian</p>
                  </div>
                  <div className="bg-[var(--bg-subtle)] rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-emerald-500">
                      {peerReviews.filter((r: any) => r.submittedAt).length}
                    </p>
                    <p className="text-xs text-[var(--text-2)]">Terkirim</p>
                  </div>
                  <div className="bg-[var(--bg-subtle)] rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-amber-500">{completionRate}%</p>
                    <p className="text-xs text-[var(--text-2)]">Completion</p>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-[var(--border)]">
                {(['reviews', 'results'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                      activeTab === tab
                        ? 'border-amber-400 text-amber-600'
                        : 'border-transparent text-[var(--text-2)] hover:text-[var(--text-1)]',
                    )}
                  >
                    {tab === 'reviews' ? (
                      <span className="flex items-center gap-1.5"><Users size={14} /> Penilaian</span>
                    ) : (
                      <span className="flex items-center gap-1.5"><BarChart2 size={14} /> Hasil Agregat</span>
                    )}
                  </button>
                ))}
                {selectedCycle.status === 'ACTIVE' && (
                  <button
                    onClick={() => setShowPeerForm(true)}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-amber-400 text-white hover:bg-amber-500 mb-1"
                  >
                    <Plus size={12} /> Isi Penilaian
                  </button>
                )}
              </div>

              {/* Tab content */}
              {activeTab === 'reviews' && (
                <div className="space-y-2">
                  {reviewsLoading && (
                    <div className="flex items-center gap-2 py-6 text-[var(--text-2)] text-sm justify-center">
                      <RefreshCw size={14} className="animate-spin" /> Memuat...
                    </div>
                  )}
                  {!reviewsLoading && peerReviews.length === 0 && (
                    <p className="text-sm text-[var(--text-2)] text-center py-6">Belum ada penilaian untuk siklus ini.</p>
                  )}
                  {peerReviews.map((review: any) => (
                    <div
                      key={review.id}
                      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-1)] truncate">
                          {review.reviewerName ?? review.reviewerId}
                          <span className="text-[var(--text-2)] font-normal"> menilai </span>
                          {review.revieweeName ?? review.revieweeId}
                          {review.reviewerId === review.revieweeId && (
                            <span className="ml-1.5 text-xs bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full">Self</span>
                          )}
                        </p>
                        <div className="flex gap-3 mt-1.5">
                          {PEER_DIMENSIONS.map(dim => (
                            <div key={dim.key} className="flex items-center gap-0.5">
                              <Star size={10} className="fill-amber-400 text-amber-400" />
                              <span className="text-xs text-[var(--text-2)]">
                                {dim.label.slice(0, 4)} {review.scores?.[dim.key] ?? '-'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {review.submittedAt ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                            Terkirim
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 border border-stone-200">
                            Draft
                          </span>
                        )}
                        <ChevronRight size={14} className="text-[var(--text-2)]" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'results' && (
                <ResultsPanel cycleId={selectedCycle.id} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
