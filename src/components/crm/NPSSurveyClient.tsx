"use client"

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Star, Plus, Search, Loader2, X, RefreshCw,
  TrendingUp, TrendingDown, Minus, BarChart2,
  MessageSquare, Users, CheckCircle, Send,
  ChevronDown, ChevronUp, Smile, Meh, Frown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { calcNPS, calcSegmentBreakdown, calcAverageScore } from '@/lib/nps-surveys'

// ── Types ─────────────────────────────────────────────────────────────────────

type TriggerType = 'POST_PURCHASE' | 'MANUAL' | 'SCHEDULED'
type Channel     = 'EMAIL' | 'SMS' | 'IN_APP'

interface NPSSurvey {
  id: string
  storeId: string
  name: string
  question: string
  active: number
  triggerType: TriggerType
  createdAt: string
  updatedAt: string
}

interface NPSResponse {
  id: string
  surveyId: string
  storeId: string
  customerId: string | null
  score: number
  comment: string | null
  channel: Channel
  respondedAt: string
}

interface ResultData {
  survey: NPSSurvey
  npsScore: number
  promoters: number
  passives: number
  detractors: number
  total: number
  avgScore: number
  segments: { segment: string; count: number; pct: number }[]
  channelBreakdown: Record<string, number>
  trend: {
    current: { npsScore: number; total: number }
    previous: { npsScore: number; total: number }
    delta: number
    trend: 'UP' | 'DOWN' | 'FLAT'
  } | null
}

interface Props {
  storeId: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_LABEL: Record<TriggerType, string> = {
  POST_PURCHASE: 'Setelah Pembelian',
  MANUAL:        'Manual',
  SCHEDULED:     'Terjadwal',
}

const TRIGGER_STYLE: Record<TriggerType, string> = {
  POST_PURCHASE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  MANUAL:        'bg-violet-500/15 text-violet-400 border-violet-500/30',
  SCHEDULED:     'bg-blue-500/15 text-blue-400 border-blue-500/30',
}

const CHANNEL_LABEL: Record<Channel, string> = {
  EMAIL:  'Email',
  SMS:    'SMS',
  IN_APP: 'In-App',
}

function npsColor(score: number) {
  if (score >= 50) return 'text-emerald-400'
  if (score >= 0)  return 'text-amber-400'
  return 'text-red-400'
}

function npsBg(score: number) {
  if (score >= 50) return 'bg-emerald-500/15 border-emerald-500/30'
  if (score >= 0)  return 'bg-amber-500/15 border-amber-500/30'
  return 'bg-red-500/15 border-red-500/30'
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NPSSurveyClient({ storeId }: Props) {
  const qc = useQueryClient()

  const [search, setSearch]               = useState('')
  const [showCreate, setShowCreate]       = useState(false)
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [showRespond, setShowRespond]     = useState(false)
  const [expandedId, setExpandedId]       = useState<string | null>(null)
  const [saving, setSaving]               = useState(false)

  // Create form
  const [form, setForm] = useState({
    name: '', question: '', triggerType: 'POST_PURCHASE' as TriggerType,
  })

  // Respond form
  const [respondForm, setRespondForm] = useState({
    score: 8, comment: '', channel: 'IN_APP' as Channel,
  })

  // ── Surveys list ─────────────────────────────────────────────────────────────

  const { data: surveysData, isLoading } = useQuery({
    queryKey: ['nps-surveys', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/nps-surveys?storeId=${storeId}`)
      return (await res.json() as any).data as NPSSurvey[]
    },
    enabled: !!storeId,
  })

  const surveys = surveysData ?? []
  const filtered = surveys.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.question.toLowerCase().includes(search.toLowerCase()),
  )

  // ── Results for expanded survey ───────────────────────────────────────────────

  const { data: resultData } = useQuery({
    queryKey: ['nps-results', expandedId, storeId],
    queryFn: async () => {
      const res = await fetch(`/api/nps-surveys/${expandedId}/results?storeId=${storeId}`)
      return (await res.json() as any).data as ResultData
    },
    enabled: !!expandedId && !!storeId,
  })

  // ── Responses for selected survey ─────────────────────────────────────────────

  const { data: responsesData } = useQuery({
    queryKey: ['nps-responses', selectedId, storeId],
    queryFn: async () => {
      const res = await fetch(`/api/nps-surveys/${selectedId}/responses?storeId=${storeId}`)
      return (await res.json() as any).data as NPSResponse[]
    },
    enabled: !!selectedId && !!storeId,
  })

  // ── Handlers ──────────────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.question.trim()) {
      toast.error('Nama dan pertanyaan wajib diisi')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/nps-surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...form }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error); return }
      toast.success('Survei NPS berhasil dibuat')
      setShowCreate(false)
      setForm({ name: '', question: '', triggerType: 'POST_PURCHASE' })
      qc.invalidateQueries({ queryKey: ['nps-surveys', storeId] })
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(survey: NPSSurvey) {
    try {
      const res = await fetch(`/api/nps-surveys/${survey.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: survey.active ? 0 : 1 }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error); return }
      toast.success(survey.active ? 'Survei dinonaktifkan' : 'Survei diaktifkan')
      qc.invalidateQueries({ queryKey: ['nps-surveys', storeId] })
    } catch {
      toast.error('Gagal memperbarui survei')
    }
  }

  async function handleRespond(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/nps-surveys/${selectedId}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...respondForm }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error); return }
      toast.success('Respons berhasil disimpan')
      setShowRespond(false)
      setRespondForm({ score: 8, comment: '', channel: 'IN_APP' })
      qc.invalidateQueries({ queryKey: ['nps-responses', selectedId, storeId] })
      qc.invalidateQueries({ queryKey: ['nps-results', selectedId, storeId] })
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Survei NPS</h1>
          <p className="text-sm text-[var(--text-2)] mt-0.5">
            Net Promoter Score — ukur loyalitas pelanggan Anda
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Buat Survei
        </button>
      </div>

      {/* Summary cards */}
      {surveys.length > 0 && (() => {
        // Aggregate quick stats across all surveys would need all responses —
        // just show survey-level counts for now
        const active   = surveys.filter(s => s.active).length
        const inactive = surveys.length - active
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Survei',    value: surveys.length, icon: <BarChart2 className="h-5 w-5 text-[var(--accent)]" /> },
              { label: 'Aktif',           value: active,         icon: <CheckCircle className="h-5 w-5 text-emerald-400" /> },
              { label: 'Tidak Aktif',     value: inactive,       icon: <X className="h-5 w-5 text-[var(--text-3)]" /> },
              { label: 'Tipe Trigger',    value: new Set(surveys.map(s => s.triggerType)).size, icon: <Send className="h-5 w-5 text-violet-400" /> },
            ].map(c => (
              <div key={c.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[var(--text-3)]">{c.label}</span>
                  {c.icon}
                </div>
                <div className="text-2xl font-bold text-[var(--text-1)]">{c.value}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-3)]" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari survei..."
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
        />
      </div>

      {/* Surveys list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Star className="h-12 w-12 text-[var(--text-3)]" />
          <p className="text-[var(--text-2)]">
            {search ? 'Tidak ada survei yang cocok' : 'Belum ada survei NPS'}
          </p>
          {!search && (
            <button
              onClick={() => setShowCreate(true)}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Buat survei pertama
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(survey => (
            <SurveyCard
              key={survey.id}
              survey={survey}
              expanded={expandedId === survey.id}
              resultData={expandedId === survey.id ? resultData : undefined}
              responses={selectedId === survey.id ? (responsesData ?? []) : []}
              onToggleExpand={() => {
                setExpandedId(expandedId === survey.id ? null : survey.id)
                setSelectedId(survey.id)
              }}
              onToggleActive={() => handleToggleActive(survey)}
              onRespond={() => {
                setSelectedId(survey.id)
                setShowRespond(true)
              }}
              qc={qc}
              storeId={storeId}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal title="Buat Survei NPS" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Nama Survei">
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="cth. Survei Pasca Pembelian"
                className={inputCls}
                required
              />
            </Field>
            <Field label="Pertanyaan">
              <textarea
                value={form.question}
                onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                placeholder="cth. Seberapa besar kemungkinan Anda merekomendasikan toko kami?"
                rows={3}
                className={inputCls}
                required
              />
            </Field>
            <Field label="Tipe Trigger">
              <select
                value={form.triggerType}
                onChange={e => setForm(f => ({ ...f, triggerType: e.target.value as TriggerType }))}
                className={inputCls}
              >
                {(Object.keys(TRIGGER_LABEL) as TriggerType[]).map(t => (
                  <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>
                ))}
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className={cancelBtnCls}>
                Batal
              </button>
              <button type="submit" disabled={saving} className={submitBtnCls}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simpan'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Respond modal */}
      {showRespond && selectedId && (
        <Modal title="Kirim Respons NPS" onClose={() => setShowRespond(false)}>
          <form onSubmit={handleRespond} className="space-y-4">
            <Field label={`Skor (${respondForm.score})`}>
              <input
                type="range"
                min={0} max={10}
                value={respondForm.score}
                onChange={e => setRespondForm(f => ({ ...f, score: Number(e.target.value) }))}
                className="w-full accent-[var(--accent)]"
              />
              <div className="flex justify-between text-xs text-[var(--text-3)] mt-1">
                <span>0 — Sangat Tidak Mungkin</span>
                <span>10 — Sangat Mungkin</span>
              </div>
            </Field>
            <Field label="Komentar (opsional)">
              <textarea
                value={respondForm.comment}
                onChange={e => setRespondForm(f => ({ ...f, comment: e.target.value }))}
                placeholder="Ceritakan pengalaman Anda..."
                rows={3}
                className={inputCls}
              />
            </Field>
            <Field label="Saluran">
              <select
                value={respondForm.channel}
                onChange={e => setRespondForm(f => ({ ...f, channel: e.target.value as Channel }))}
                className={inputCls}
              >
                {(Object.keys(CHANNEL_LABEL) as Channel[]).map(c => (
                  <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
                ))}
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowRespond(false)} className={cancelBtnCls}>
                Batal
              </button>
              <button type="submit" disabled={saving} className={submitBtnCls}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kirim'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ── SurveyCard ────────────────────────────────────────────────────────────────

function SurveyCard({
  survey, expanded, resultData, responses,
  onToggleExpand, onToggleActive, onRespond,
  storeId, qc,
}: {
  survey: NPSSurvey
  expanded: boolean
  resultData?: ResultData
  responses: NPSResponse[]
  onToggleExpand: () => void
  onToggleActive: () => void
  onRespond: () => void
  storeId: string
  qc: ReturnType<typeof useQueryClient>
}) {
  const nps = resultData ? resultData.npsScore : null

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[var(--text-1)] truncate">{survey.name}</span>
            <span className={cn(
              'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border',
              TRIGGER_STYLE[survey.triggerType],
            )}>
              {TRIGGER_LABEL[survey.triggerType]}
            </span>
            <span className={cn(
              'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border',
              survey.active
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-[var(--bg-hover)] text-[var(--text-3)] border-[var(--border)]',
            )}>
              {survey.active ? 'Aktif' : 'Nonaktif'}
            </span>
          </div>
          <p className="text-sm text-[var(--text-2)] mt-1 line-clamp-2">{survey.question}</p>
        </div>

        {/* NPS badge if results loaded */}
        {nps !== null && (
          <div className={cn(
            'shrink-0 flex flex-col items-center justify-center rounded-xl border px-3 py-2 min-w-[72px]',
            npsBg(nps),
          )}>
            <span className={cn('text-xl font-bold', npsColor(nps))}>
              {nps > 0 ? `+${nps}` : nps}
            </span>
            <span className="text-[10px] text-[var(--text-3)] mt-0.5">NPS</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 pb-3 border-t border-[var(--border)] pt-3">
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? 'Tutup detail' : 'Lihat hasil'}
        </button>
        <span className="text-[var(--border)]">·</span>
        <button
          onClick={onRespond}
          className="flex items-center gap-1.5 text-xs text-[var(--text-2)] hover:text-[var(--text-1)]"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Kirim Respons
        </button>
        <span className="text-[var(--border)]">·</span>
        <button
          onClick={onToggleActive}
          className="text-xs text-[var(--text-3)] hover:text-[var(--text-1)]"
        >
          {survey.active ? 'Nonaktifkan' : 'Aktifkan'}
        </button>
      </div>

      {/* Expanded results */}
      {expanded && resultData && (
        <div className="border-t border-[var(--border)] p-4 space-y-4 bg-[var(--bg-page)]">
          {/* Score breakdown */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Promoter',  count: resultData.promoters,  icon: <Smile className="h-4 w-4 text-emerald-400" />, cls: 'text-emerald-400' },
              { label: 'Pasif',     count: resultData.passives,   icon: <Meh   className="h-4 w-4 text-amber-400" />,   cls: 'text-amber-400' },
              { label: 'Detraktor', count: resultData.detractors, icon: <Frown className="h-4 w-4 text-red-400" />,     cls: 'text-red-400' },
            ].map(({ label, count, icon, cls }) => (
              <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 text-center">
                <div className="flex items-center justify-center mb-1">{icon}</div>
                <div className={cn('text-lg font-bold', cls)}>{count}</div>
                <div className="text-xs text-[var(--text-3)]">{label}</div>
              </div>
            ))}
          </div>

          {/* Segment bars */}
          <div className="space-y-2">
            {resultData.segments.map(s => (
              <div key={s.segment}>
                <div className="flex items-center justify-between text-xs text-[var(--text-2)] mb-1">
                  <span>{s.segment === 'PROMOTER' ? 'Promoter' : s.segment === 'PASSIVE' ? 'Pasif' : 'Detraktor'}</span>
                  <span>{s.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      s.segment === 'PROMOTER' ? 'bg-emerald-500' :
                      s.segment === 'PASSIVE'  ? 'bg-amber-500' : 'bg-red-500',
                    )}
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Trend */}
          {resultData.trend && (
            <div className="flex items-center gap-2 text-sm">
              {resultData.trend.trend === 'UP' ? (
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              ) : resultData.trend.trend === 'DOWN' ? (
                <TrendingDown className="h-4 w-4 text-red-400" />
              ) : (
                <Minus className="h-4 w-4 text-[var(--text-3)]" />
              )}
              <span className="text-[var(--text-2)]">
                Perubahan NPS:{' '}
                <span className={cn(
                  'font-semibold',
                  resultData.trend.delta > 0 ? 'text-emerald-400' :
                  resultData.trend.delta < 0 ? 'text-red-400' : 'text-[var(--text-3)]',
                )}>
                  {resultData.trend.delta > 0 ? '+' : ''}{resultData.trend.delta}
                </span>{' '}
                dari periode sebelumnya
              </span>
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs text-[var(--text-3)] border-t border-[var(--border)] pt-3">
            <span><Users className="inline h-3.5 w-3.5 mr-1" />{resultData.total} respons</span>
            <span>Rata-rata skor: <strong className="text-[var(--text-2)]">{resultData.avgScore}</strong></span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: {
  title: string; children: React.ReactNode; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[var(--text-1)]">{title}</h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-[var(--text-2)]">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30'
const cancelBtnCls =
  'px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors'
const submitBtnCls =
  'flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50'
