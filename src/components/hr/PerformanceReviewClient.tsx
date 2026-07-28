'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Star,
  Plus,
  X,
  ChevronDown,
  CheckCircle,
  Clock,
  Users,
  BarChart2,
  FileText,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PerformanceReviewClientProps {
  storeId: string
  userRole?: string
}

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const SCORE_LABELS: Record<number, string> = {
  1: 'Perlu Perbaikan',
  2: 'Di Bawah Ekspektasi',
  3: 'Memenuhi Ekspektasi',
  4: 'Melampaui Ekspektasi',
  5: 'Luar Biasa',
}

const DIMENSIONS = [
  { key: 'attendance', label: 'Kehadiran' },
  { key: 'sales', label: 'Penjualan' },
  { key: 'teamwork', label: 'Kerja Tim' },
  { key: 'punctuality', label: 'Ketepatan Waktu' },
]

const STATUS_CONFIG: Record<string, { label: string; pill: string }> = {
  DRAFT: {
    label: 'Draft',
    pill: 'bg-stone-100 text-stone-500 border border-stone-200',
  },
  SUBMITTED: {
    label: 'Dikirim',
    pill: 'bg-blue-50 text-blue-600 border border-blue-200',
  },
  APPROVED: {
    label: 'Disetujui',
    pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  },
}

const CYCLE_STATUS_CONFIG: Record<string, { label: string; pill: string }> = {
  ACTIVE: { label: 'Aktif', pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
  CLOSED: { label: 'Selesai', pill: 'bg-stone-100 text-stone-500 border border-stone-200' },
  DRAFT: { label: 'Draft', pill: 'bg-amber-50 text-amber-600 border border-amber-200' },
}

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
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n)}
          className={cn(
            'transition-colors',
            readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110',
          )}
        >
          <Star
            size={18}
            className={cn(
              n <= value ? 'fill-amber-400 text-amber-400' : 'text-stone-300',
            )}
          />
        </button>
      ))}
      <span className="ml-1 text-xs text-[var(--text-2)]">{SCORE_LABELS[value] ?? ''}</span>
    </div>
  )
}

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
    period: 'QUARTERLY',
    year: new Date().getFullYear(),
    startDate: '',
    endDate: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.startDate || !form.endDate) {
      setError('Semua field wajib diisi')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/hr/review-cycles?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Gagal menyimpan')
        return
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
          Nama Siklus
        </label>
        <input
          className={inputCls}
          placeholder="mis. Kuartal 1 2025"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Periode</label>
          <select
            className={inputCls}
            value={form.period}
            onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
          >
            <option value="QUARTERLY">Kuartalan</option>
            <option value="ANNUAL">Tahunan</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Tahun</label>
          <input
            type="number"
            className={inputCls}
            value={form.year}
            onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
            Tanggal Mulai
          </label>
          <input
            type="date"
            className={inputCls}
            value={form.startDate}
            onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
            Tanggal Selesai
          </label>
          <input
            type="date"
            className={inputCls}
            value={form.endDate}
            onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
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
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </form>
  )
}

function ReviewForm({
  storeId,
  cycle,
  employees,
  review,
  onClose,
  onSaved,
}: {
  storeId: string
  cycle: any
  employees: any[]
  review?: any
  onClose: () => void
  onSaved: () => void
}) {
  const initialScores = review?.scores
    ? typeof review.scores === 'string'
      ? JSON.parse(review.scores)
      : review.scores
    : { attendance: 3, sales: 3, teamwork: 3, punctuality: 3 }

  const [form, setForm] = useState({
    employeeId: review?.employeeId ?? '',
    scores: initialScores as Record<string, number>,
    comments: review?.comments ?? '',
    selfAssessment: review?.selfAssessment ?? '',
    status: review?.status ?? 'DRAFT',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const overallScore =
    Math.round(
      (Object.values(form.scores).reduce((a, b) => a + b, 0) / DIMENSIONS.length) * 10,
    ) / 10

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.employeeId) {
      setError('Pilih karyawan terlebih dahulu')
      return
    }
    setSaving(true)
    setError('')
    try {
      const url = review
        ? `/api/hr/reviews/${review.id}?storeId=${storeId}`
        : `/api/hr/reviews?storeId=${storeId}`
      const method = review ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleId: cycle.id,
          employeeId: form.employeeId,
          scores: form.scores,
          overallScore,
          comments: form.comments,
          selfAssessment: form.selfAssessment,
          status: form.status,
        }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Gagal menyimpan')
        return
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Karyawan</label>
        <select
          className={inputCls}
          value={form.employeeId}
          onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
          disabled={!!review}
        >
          <option value="">-- Pilih Karyawan --</option>
          {employees.map((emp: any) => (
            <option key={emp.id} value={emp.id}>
              {emp.name} — {emp.position ?? 'Staff'}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-[var(--text-2)]">Penilaian (1–5)</p>
        {DIMENSIONS.map(dim => (
          <div key={dim.key} className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-1)] w-36">{dim.label}</span>
            <StarRating
              value={form.scores[dim.key] ?? 3}
              onChange={v =>
                setForm(f => ({ ...f, scores: { ...f.scores, [dim.key]: v } }))
              }
            />
          </div>
        ))}
        <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
          <span className="text-sm font-semibold text-[var(--text-1)]">Nilai Keseluruhan</span>
          <span className="text-lg font-bold text-amber-500">{overallScore.toFixed(1)} / 5</span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
          Komentar Manajer
        </label>
        <textarea
          className={cn(inputCls, 'resize-none')}
          rows={3}
          placeholder="Catatan evaluasi..."
          value={form.comments}
          onChange={e => setForm(f => ({ ...f, comments: e.target.value }))}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
          Penilaian Diri (Self-Assessment)
        </label>
        <textarea
          className={cn(inputCls, 'resize-none')}
          rows={3}
          placeholder="Penilaian dari karyawan sendiri..."
          value={form.selfAssessment}
          onChange={e => setForm(f => ({ ...f, selfAssessment: e.target.value }))}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Status</label>
        <select
          className={inputCls}
          value={form.status}
          onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
        >
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Kirim ke Karyawan</option>
          <option value="APPROVED">Setujui</option>
        </select>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
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
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </form>
  )
}

export default function PerformanceReviewClient({
  storeId,
  userRole,
}: PerformanceReviewClientProps) {
  const qc = useQueryClient()
  const [showCycleForm, setShowCycleForm] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [selectedCycle, setSelectedCycle] = useState<any>(null)
  const [editReview, setEditReview] = useState<any>(null)

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

  const { data: reviews = [], isLoading: reviewsLoading } = useQuery<any[]>({
    queryKey: ['reviews', storeId, selectedCycle?.id],
    enabled: !!selectedCycle,
    queryFn: async () => {
      const r = await fetch(
        `/api/hr/reviews?storeId=${storeId}&cycleId=${selectedCycle.id}`,
      )
      if (!r.ok) return []
      return r.json() as Promise<any[]>
    },
  })

  const isManager = userRole === 'OWNER' || userRole === 'MANAGER'

  const activeCycle = cycles.find((c: any) => c.status === 'ACTIVE')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-1)]">Penilaian Kinerja</h2>
          <p className="text-sm text-[var(--text-2)] mt-0.5">
            Kelola siklus dan penilaian kinerja karyawan
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
              <h3 className="font-semibold text-[var(--text-1)]">Buat Siklus Penilaian</h3>
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

      {/* Review form modal */}
      {showReviewForm && selectedCycle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[var(--text-1)]">
                {editReview ? 'Edit Penilaian' : 'Tambah Penilaian'}
              </h3>
              <button
                onClick={() => {
                  setShowReviewForm(false)
                  setEditReview(null)
                }}
              >
                <X size={18} className="text-[var(--text-2)]" />
              </button>
            </div>
            <ReviewForm
              storeId={storeId}
              cycle={selectedCycle}
              employees={employees}
              review={editReview}
              onClose={() => {
                setShowReviewForm(false)
                setEditReview(null)
              }}
              onSaved={() =>
                qc.invalidateQueries({ queryKey: ['reviews', storeId, selectedCycle.id] })
              }
            />
          </div>
        </div>
      )}

      {/* Cycles list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cyclesLoading ? (
          <div className="col-span-3 text-center py-12 text-[var(--text-2)]">Memuat...</div>
        ) : cycles.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-[var(--text-2)]">
            Belum ada siklus penilaian
          </div>
        ) : (
          (cycles as any[]).map((cycle: any) => (
            <button
              key={cycle.id}
              onClick={() => setSelectedCycle(cycle)}
              className={cn(
                'text-left p-4 rounded-2xl border transition-all',
                selectedCycle?.id === cycle.id
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-amber-300',
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="font-semibold text-[var(--text-1)] text-sm">{cycle.name}</span>
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    CYCLE_STATUS_CONFIG[cycle.status]?.pill,
                  )}
                >
                  {CYCLE_STATUS_CONFIG[cycle.status]?.label ?? cycle.status}
                </span>
              </div>
              <div className="text-xs text-[var(--text-2)] space-y-0.5">
                <div>{cycle.period === 'QUARTERLY' ? 'Kuartalan' : 'Tahunan'} • {cycle.year}</div>
                <div>
                  {cycle.startDate} – {cycle.endDate}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Reviews panel */}
      {selectedCycle && (
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 size={18} className="text-amber-500" />
              <h3 className="font-semibold text-[var(--text-1)]">
                Penilaian — {selectedCycle.name}
              </h3>
              <span className="text-xs text-[var(--text-2)]">
                ({(reviews as any[]).length} penilaian)
              </span>
            </div>
            {isManager && (
              <button
                onClick={() => setShowReviewForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 text-white text-xs font-medium hover:bg-amber-500"
              >
                <Plus size={14} />
                Tambah
              </button>
            )}
          </div>

          {reviewsLoading ? (
            <div className="text-center py-8 text-[var(--text-2)]">Memuat penilaian...</div>
          ) : (reviews as any[]).length === 0 ? (
            <div className="text-center py-8 text-[var(--text-2)]">Belum ada penilaian</div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {(reviews as any[]).map((review: any) => {
                const scores =
                  typeof review.scores === 'string'
                    ? JSON.parse(review.scores)
                    : review.scores ?? {}
                return (
                  <div key={review.id} className="py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm text-[var(--text-1)]">
                          {review.employeeName}
                        </span>
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full',
                            STATUS_CONFIG[review.status]?.pill,
                          )}
                        >
                          {STATUS_CONFIG[review.status]?.label ?? review.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {DIMENSIONS.map(dim => (
                          <div key={dim.key} className="text-xs text-[var(--text-2)]">
                            {dim.label}:{' '}
                            <span className="font-semibold text-amber-500">
                              {scores[dim.key] ?? '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                      {review.comments && (
                        <p className="text-xs text-[var(--text-2)] mt-1 line-clamp-2">
                          {review.comments}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-amber-500">
                          {Number(review.overallScore).toFixed(1)}
                        </div>
                        <div className="text-xs text-[var(--text-2)]">/ 5</div>
                      </div>
                      {isManager && (
                        <button
                          onClick={() => {
                            setEditReview(review)
                            setShowReviewForm(true)
                          }}
                          className="text-xs text-amber-600 hover:underline"
                        >
                          Edit
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
    </div>
  )
}
