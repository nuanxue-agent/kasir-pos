'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Send,
  BarChart3,
  MessageSquare,
  Star,
  Hash,
  List,
  Type,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  Loader2,
  TrendingUp,
  Users,
  Percent,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface FeedbackClientProps {
  storeId: string
  currency: string
}

type QuestionType = 'RATING' | 'NPS' | 'TEXT' | 'MULTIPLE_CHOICE'

interface SurveyQuestion {
  id: string
  surveyId: string
  text: string
  type: QuestionType
  options: string[] | null
  order: number
}

interface Survey {
  id: string
  storeId: string
  name: string
  description: string | null
  active: boolean
  createdAt: string
  questionCount?: number
  responseCount?: number
}

interface SurveyAnalytics {
  totalResponses: number
  avgNps: number | null
  avgRating: number | null
  responseRate: number
  npsBreakdown: { promoters: number; passives: number; detractors: number }
}

const QUESTION_TYPE_CONFIG: Record<QuestionType, { label: string; icon: React.ReactNode; color: string }> = {
  RATING: { label: 'Rating 1-5', icon: <Star className="h-3.5 w-3.5" />, color: 'text-amber-600 bg-amber-50' },
  NPS: { label: 'NPS 0-10', icon: <Hash className="h-3.5 w-3.5" />, color: 'text-blue-600 bg-blue-50' },
  TEXT: { label: 'Teks Bebas', icon: <Type className="h-3.5 w-3.5" />, color: 'text-purple-600 bg-purple-50' },
  MULTIPLE_CHOICE: { label: 'Pilihan Ganda', icon: <List className="h-3.5 w-3.5" />, color: 'text-emerald-600 bg-emerald-50' },
}

function npsColor(score: number | null): string {
  if (score === null) return 'text-[var(--text-3)]'
  if (score < 6) return 'text-red-500'
  if (score < 9) return 'text-amber-500'
  return 'text-emerald-500'
}

function npsLabel(score: number | null): string {
  if (score === null) return '—'
  if (score < 6) return 'Detractor'
  if (score < 9) return 'Passive'
  return 'Promoter'
}

// ── Survey Creator Modal ──────────────────────────────────────────────────────

interface SurveyBuilderProps {
  storeId: string
  onClose: () => void
  onSaved: () => void
}

function SurveyBuilder({ storeId, onClose, onSaved }: SurveyBuilderProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<
    { text: string; type: QuestionType; options: string[] }[]
  >([{ text: '', type: 'NPS', options: [] }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addQuestion() {
    setQuestions(q => [...q, { text: '', type: 'RATING', options: [] }])
  }

  function removeQuestion(i: number) {
    setQuestions(q => q.filter((_, idx) => idx !== i))
  }

  function updateQuestion(i: number, patch: Partial<(typeof questions)[0]>) {
    setQuestions(q => q.map((item, idx) => (idx === i ? { ...item, ...patch } : item)))
  }

  function addOption(qi: number) {
    setQuestions(q =>
      q.map((item, idx) => (idx === qi ? { ...item, options: [...item.options, ''] } : item)),
    )
  }

  function updateOption(qi: number, oi: number, val: string) {
    setQuestions(q =>
      q.map((item, idx) =>
        idx === qi
          ? { ...item, options: item.options.map((o, j) => (j === oi ? val : o)) }
          : item,
      ),
    )
  }

  async function handleSave() {
    if (!name.trim()) { setError('Nama survei harus diisi'); return }
    if (questions.some(q => !q.text.trim())) { setError('Semua pertanyaan harus diisi'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/surveys?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          questions: questions.map((q, i) => ({
            text: q.text.trim(),
            type: q.type,
            options: q.options.filter(o => o.trim()),
            order: i,
          })),
        }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Gagal menyimpan')
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--bg-card)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--text-1)]">Buat Survei Baru</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-subtle)]">
            <X className="h-4 w-4 text-[var(--text-3)]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Survey info */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Nama Survei *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="cth. Kepuasan Pelanggan Bulanan"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Deskripsi</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder="Opsional — ditampilkan di atas survei"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
              />
            </div>
          </div>

          {/* Questions */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
              Pertanyaan ({questions.length})
            </h3>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-600">
                      {i + 1}
                    </span>
                    <div className="flex-1 space-y-2">
                      <input
                        value={q.text}
                        onChange={e => updateQuestion(i, { text: e.target.value })}
                        placeholder="Teks pertanyaan..."
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(QUESTION_TYPE_CONFIG) as QuestionType[]).map(t => (
                          <button
                            key={t}
                            onClick={() => updateQuestion(i, { type: t, options: [] })}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                              q.type === t
                                ? QUESTION_TYPE_CONFIG[t].color + ' ring-1 ring-current/30'
                                : 'bg-[var(--bg-card)] text-[var(--text-3)] hover:bg-[var(--bg-muted)]',
                            )}
                          >
                            {QUESTION_TYPE_CONFIG[t].icon}
                            {QUESTION_TYPE_CONFIG[t].label}
                          </button>
                        ))}
                      </div>
                      {q.type === 'MULTIPLE_CHOICE' && (
                        <div className="space-y-1.5">
                          {q.options.map((opt, oi) => (
                            <input
                              key={oi}
                              value={opt}
                              onChange={e => updateOption(i, oi, e.target.value)}
                              placeholder={`Pilihan ${oi + 1}`}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            />
                          ))}
                          <button
                            onClick={() => addOption(i)}
                            className="text-xs font-medium text-amber-600 hover:underline"
                          >
                            + Tambah pilihan
                          </button>
                        </div>
                      )}
                    </div>
                    {questions.length > 1 && (
                      <button
                        onClick={() => removeQuestion(i)}
                        className="mt-1.5 rounded-lg p-1 hover:bg-red-50 text-[var(--text-3)] hover:text-red-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={addQuestion}
              className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Tambah pertanyaan
            </button>
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Simpan Survei
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Analytics Panel ───────────────────────────────────────────────────────────

function AnalyticsPanel({ surveyId, storeId }: { surveyId: string; storeId: string }) {
  const { data, isLoading } = useQuery<SurveyAnalytics>({
    queryKey: ['survey-analytics', surveyId],
    queryFn: () =>
      fetch(`/api/surveys/${surveyId}/analytics?storeId=${storeId}`).then(r => r.json()),
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-3 p-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
        ))}
      </div>
    )
  }

  const a = data as SurveyAnalytics | undefined
  const npsScore = a?.avgNps ?? null

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {/* NPS */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-center">
          <p className="text-xs text-[var(--text-3)] mb-1">Avg NPS</p>
          <p className={cn('text-2xl font-bold', npsColor(npsScore))}>
            {npsScore !== null ? npsScore.toFixed(1) : '—'}
          </p>
          <p className={cn('text-[10px] font-medium mt-0.5', npsColor(npsScore))}>
            {npsLabel(npsScore)}
          </p>
        </div>
        {/* Avg Rating */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-center">
          <p className="text-xs text-[var(--text-3)] mb-1">Avg Rating</p>
          <p className="text-2xl font-bold text-amber-500">
            {a?.avgRating !== null && a?.avgRating !== undefined ? a.avgRating.toFixed(1) : '—'}
          </p>
          <p className="text-[10px] text-[var(--text-3)] mt-0.5">dari 5</p>
        </div>
        {/* Responses */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-center">
          <p className="text-xs text-[var(--text-3)] mb-1">Respons</p>
          <p className="text-2xl font-bold text-[var(--text-1)]">{a?.totalResponses ?? 0}</p>
          <p className="text-[10px] text-[var(--text-3)] mt-0.5">
            {a?.responseRate !== undefined ? `${(a.responseRate * 100).toFixed(0)}% rate` : ''}
          </p>
        </div>
      </div>

      {/* NPS breakdown */}
      {a && a.totalResponses > 0 && a.npsBreakdown && (
        <div className="rounded-xl border border-[var(--border)] p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--text-2)]">NPS Breakdown</p>
          <div className="flex gap-2 text-xs">
            <div className="flex-1 rounded-lg bg-emerald-50 p-2 text-center">
              <p className="font-bold text-emerald-600">{a.npsBreakdown.promoters}</p>
              <p className="text-emerald-500">Promoter</p>
            </div>
            <div className="flex-1 rounded-lg bg-amber-50 p-2 text-center">
              <p className="font-bold text-amber-600">{a.npsBreakdown.passives}</p>
              <p className="text-amber-500">Passive</p>
            </div>
            <div className="flex-1 rounded-lg bg-red-50 p-2 text-center">
              <p className="font-bold text-red-500">{a.npsBreakdown.detractors}</p>
              <p className="text-red-400">Detractor</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FeedbackClient({ storeId, currency }: FeedbackClientProps) {
  const qc = useQueryClient()
  const [showBuilder, setShowBuilder] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: surveys = [], isLoading } = useQuery<Survey[]>({
    queryKey: ['surveys', storeId],
    queryFn: () =>
      fetch(`/api/surveys?storeId=${storeId}`).then(r => r.json()),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await fetch(`/api/surveys/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys', storeId] }),
  })

  function buildWhatsAppLink(survey: Survey) {
    const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const surveyUrl = `${appUrl}/survey/${survey.id}`
    const text = encodeURIComponent(
      `Halo! Kami mengundang Anda mengisi survei "${survey.name}".\n\nKlik di sini: ${surveyUrl}\n\nTerima kasih atas partisipasinya 🙏`,
    )
    return `https://wa.me/?text=${text}`
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)]">Survei & Feedback</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">
            Buat dan kelola survei kepuasan pelanggan
          </p>
        </div>
        <button
          onClick={() => setShowBuilder(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Buat Survei
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            icon: <MessageSquare className="h-4 w-4 text-blue-500" />,
            label: 'Total Survei',
            value: surveys.length,
            bg: 'bg-blue-50',
          },
          {
            icon: <TrendingUp className="h-4 w-4 text-emerald-500" />,
            label: 'Aktif',
            value: surveys.filter(s => s.active).length,
            bg: 'bg-emerald-50',
          },
          {
            icon: <Users className="h-4 w-4 text-amber-500" />,
            label: 'Total Respons',
            value: surveys.reduce((acc, s) => acc + (s.responseCount ?? 0), 0),
            bg: 'bg-amber-50',
          },
        ].map(card => (
          <div
            key={card.label}
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm"
          >
            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', card.bg)}>
              {card.icon}
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--text-1)]">{card.value}</p>
              <p className="text-xs text-[var(--text-3)]">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Surveys list */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--text-1)]">Daftar Survei</h2>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
            ))}
          </div>
        ) : surveys.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-subtle)]">
              <MessageSquare className="h-6 w-6 text-[var(--text-3)]" />
            </div>
            <p className="text-sm text-[var(--text-2)]">Belum ada survei</p>
            <button
              onClick={() => setShowBuilder(true)}
              className="text-xs font-medium text-amber-600 hover:underline"
            >
              Buat survei pertama →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {(surveys as Survey[]).map(survey => {
              const expanded = expandedId === survey.id
              return (
                <div key={survey.id}>
                  <div className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--bg-subtle)] transition-colors">
                    {/* Status dot */}
                    <div
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        survey.active ? 'bg-emerald-500' : 'bg-stone-300',
                      )}
                    />

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text-1)]">
                        {survey.name}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-3)]">
                        {survey.questionCount ?? 0} pertanyaan · {survey.responseCount ?? 0} respons
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      {/* Toggle active */}
                      <button
                        onClick={() => toggleMutation.mutate({ id: survey.id, active: !survey.active })}
                        className={cn(
                          'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                          survey.active
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-3)] hover:bg-[var(--bg-muted)]',
                        )}
                      >
                        {survey.active ? 'Aktif' : 'Nonaktif'}
                      </button>

                      {/* Send via WhatsApp */}
                      <a
                        href={buildWhatsAppLink(survey)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#1db954] transition-colors"
                      >
                        <Send className="h-3 w-3" />
                        Kirim Survey
                      </a>

                      {/* Expand analytics */}
                      <button
                        onClick={() => setExpandedId(expanded ? null : survey.id)}
                        className="rounded-lg p-1.5 hover:bg-[var(--bg-subtle)] text-[var(--text-3)]"
                      >
                        {expanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded analytics */}
                  {expanded && (
                    <div className="border-t border-[var(--border)] bg-[var(--bg-subtle)]">
                      <AnalyticsPanel surveyId={survey.id} storeId={storeId} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Survey Builder Modal */}
      {showBuilder && (
        <SurveyBuilder
          storeId={storeId}
          onClose={() => setShowBuilder(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['surveys', storeId] })}
        />
      )}
    </div>
  )
}
