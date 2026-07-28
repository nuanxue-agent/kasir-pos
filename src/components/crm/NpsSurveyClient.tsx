'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  BarChart3,
  TrendingUp,
  Users,
  ThumbsUp,
  ThumbsDown,
  Minus,
  X,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NpsSurveyClientProps {
  storeId: string
}

interface NpsSurvey {
  id: string
  storeId: string
  name: string
  question: string
  active: boolean | number
  createdAt: string
  responseCount?: number
}

interface NpsResults {
  surveyId: string
  npsScore: number | null
  total: number
  breakdown: {
    promoters: number
    passives: number
    detractors: number
    promoterPct: number
    passivePct: number
    detractorPct: number
  }
  weeklyTrend: { week: string; nps: number | null; count: number }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function npsColor(score: number | null): string {
  if (score === null) return 'text-[var(--text-3)]'
  if (score < 0) return 'text-red-500'
  if (score < 50) return 'text-amber-500'
  return 'text-emerald-500'
}

function npsLabel(score: number | null): string {
  if (score === null) return '—'
  if (score < 0) return 'Perlu Perbaikan'
  if (score < 50) return 'Cukup Baik'
  return 'Sangat Baik'
}

function formatWeek(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

// ── Create Survey Modal ───────────────────────────────────────────────────────

interface CreateModalProps {
  storeId: string
  onClose: () => void
  onSaved: () => void
}

function CreateModal({ storeId, onClose, onSaved }: CreateModalProps) {
  const [name, setName] = useState('')
  const [question, setQuestion] = useState('Seberapa besar kemungkinan Anda merekomendasikan toko kami kepada teman atau keluarga?')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('Nama survei harus diisi'); return }
    if (!question.trim()) { setError('Pertanyaan harus diisi'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/nps-surveys?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), question: question.trim() }),
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
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--text-1)]">Buat Survei NPS</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-subtle)]">
            <X className="h-4 w-4 text-[var(--text-3)]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Nama Survei *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="cth. NPS Pasca Pembelian"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Pertanyaan NPS *</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>
          <p className="rounded-xl bg-blue-50 px-4 py-3 text-xs text-blue-700">
            Pelanggan akan memilih skor 0–10. Promoter (9–10), Passive (7–8), Detractor (0–6).
          </p>
          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
          )}
        </div>

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
            Simpan
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Results Panel ─────────────────────────────────────────────────────────────

function ResultsPanel({ surveyId, storeId }: { surveyId: string; storeId: string }) {
  const { data, isLoading } = useQuery<NpsResults>({
    queryKey: ['nps-results', surveyId],
    queryFn: () =>
      fetch(`/api/nps-surveys/${surveyId}/results?storeId=${storeId}`).then(r => r.json() as Promise<NpsResults>),
  })

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1].map(i => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
        ))}
      </div>
    )
  }

  const r = data as NpsResults | undefined
  if (!r) return null

  const trendMax = Math.max(
    ...r.weeklyTrend.map(w => Math.abs(w.nps ?? 0)),
    1,
  )

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Score + breakdown */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-center">
          <p className="text-xs text-[var(--text-3)] mb-1">NPS Score</p>
          <p className={cn('text-2xl font-bold', npsColor(r.npsScore))}>
            {r.npsScore !== null ? r.npsScore : '—'}
          </p>
          <p className={cn('text-[10px] font-medium mt-0.5', npsColor(r.npsScore))}>
            {npsLabel(r.npsScore)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-emerald-50 p-3 text-center">
          <p className="text-xs text-emerald-600 mb-1">Promoter</p>
          <p className="text-2xl font-bold text-emerald-600">{r.breakdown.promoters}</p>
          <p className="text-[10px] text-emerald-500 mt-0.5">{r.breakdown.promoterPct}%</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-amber-50 p-3 text-center">
          <p className="text-xs text-amber-600 mb-1">Passive</p>
          <p className="text-2xl font-bold text-amber-600">{r.breakdown.passives}</p>
          <p className="text-[10px] text-amber-500 mt-0.5">{r.breakdown.passivePct}%</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-red-50 p-3 text-center">
          <p className="text-xs text-red-500 mb-1">Detractor</p>
          <p className="text-2xl font-bold text-red-500">{r.breakdown.detractors}</p>
          <p className="text-[10px] text-red-400 mt-0.5">{r.breakdown.detractorPct}%</p>
        </div>
      </div>

      {/* Segment bar */}
      {r.total > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[var(--text-2)]">Distribusi Segmen</p>
          <div className="flex h-3 overflow-hidden rounded-full">
            {r.breakdown.promoterPct > 0 && (
              <div
                className="bg-emerald-400 transition-all"
                style={{ width: `${r.breakdown.promoterPct}%` }}
              />
            )}
            {r.breakdown.passivePct > 0 && (
              <div
                className="bg-amber-400 transition-all"
                style={{ width: `${r.breakdown.passivePct}%` }}
              />
            )}
            {r.breakdown.detractorPct > 0 && (
              <div
                className="bg-red-400 transition-all"
                style={{ width: `${r.breakdown.detractorPct}%` }}
              />
            )}
          </div>
          <div className="flex gap-3 text-[10px] text-[var(--text-3)]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />Promoter</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />Passive</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400 inline-block" />Detractor</span>
          </div>
        </div>
      )}

      {/* Weekly trend sparkline */}
      <div>
        <p className="mb-2 text-xs font-semibold text-[var(--text-2)]">Tren NPS 12 Minggu Terakhir</p>
        <div className="flex items-end gap-1 h-20">
          {r.weeklyTrend.map(w => {
            const val = w.nps
            const barH = val === null ? 0 : Math.round((Math.abs(val) / trendMax) * 60)
            const isPos = val !== null && val >= 0
            return (
              <div
                key={w.week}
                className="flex flex-1 flex-col items-center gap-0.5"
                title={`${formatWeek(w.week)}: NPS ${val ?? '—'} (${w.count} resp)`}
              >
                <span className="text-[8px] text-[var(--text-3)]">
                  {val !== null ? val : ''}
                </span>
                <div
                  className={cn(
                    'w-full rounded-sm transition-all',
                    val === null
                      ? 'bg-[var(--bg-subtle)]'
                      : isPos
                        ? 'bg-emerald-400'
                        : 'bg-red-400',
                  )}
                  style={{ height: `${Math.max(barH, 4)}px` }}
                />
                <span className="text-[8px] text-[var(--text-3)]">{formatWeek(w.week)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function NpsSurveyClient({ storeId }: NpsSurveyClientProps) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: surveys = [], isLoading } = useQuery<NpsSurvey[]>({
    queryKey: ['nps-surveys', storeId],
    queryFn: () =>
      fetch(`/api/nps-surveys?storeId=${storeId}`).then(r => r.json() as Promise<NpsSurvey[]>),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await fetch(`/api/nps-surveys/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nps-surveys', storeId] }),
  })

  function buildWhatsAppLink(survey: NpsSurvey) {
    const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const surveyUrl = `${appUrl}/nps/${survey.id}`
    const text = encodeURIComponent(
      `Halo! Kami mengundang Anda mengisi survei singkat: "${survey.name}"\n\n${surveyUrl}\n\nTerima kasih 🙏`,
    )
    return `https://wa.me/?text=${text}`
  }

  const activeSurveys = (surveys as NpsSurvey[]).filter(s => s.active)
  const totalResponses = (surveys as NpsSurvey[]).reduce((acc, s) => acc + (s.responseCount ?? 0), 0)

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)]">NPS Survey</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">
            Net Promoter Score — ukur loyalitas pelanggan pasca pembelian
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Buat Survei
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            icon: <BarChart3 className="h-4 w-4 text-blue-500" />,
            label: 'Total Survei',
            value: (surveys as NpsSurvey[]).length,
            bg: 'bg-blue-50',
          },
          {
            icon: <TrendingUp className="h-4 w-4 text-emerald-500" />,
            label: 'Aktif',
            value: activeSurveys.length,
            bg: 'bg-emerald-50',
          },
          {
            icon: <Users className="h-4 w-4 text-amber-500" />,
            label: 'Total Respons',
            value: totalResponses,
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
          <h2 className="text-sm font-semibold text-[var(--text-1)]">Daftar Survei NPS</h2>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
            ))}
          </div>
        ) : (surveys as NpsSurvey[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-subtle)]">
              <BarChart3 className="h-6 w-6 text-[var(--text-3)]" />
            </div>
            <p className="text-sm text-[var(--text-2)]">Belum ada survei NPS</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-xs font-medium text-amber-600 hover:underline"
            >
              Buat survei pertama →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {(surveys as NpsSurvey[]).map(survey => {
              const isActive = Boolean(survey.active)
              const expanded = expandedId === survey.id
              return (
                <div key={survey.id}>
                  <div className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--bg-subtle)] transition-colors">
                    {/* Active dot */}
                    <div
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        isActive ? 'bg-emerald-400' : 'bg-[var(--text-3)]',
                      )}
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-1)]">{survey.name}</p>
                      <p className="truncate text-xs text-[var(--text-3)] mt-0.5">{survey.question}</p>
                    </div>

                    {/* Response count */}
                    <span className="text-sm font-semibold text-[var(--text-2)] tabular-nums">
                      {survey.responseCount ?? 0}
                      <span className="ml-0.5 text-xs font-normal text-[var(--text-3)]">resp</span>
                    </span>

                    {/* Segment icons */}
                    <div className="flex items-center gap-1">
                      <ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />
                      <Minus className="h-3.5 w-3.5 text-amber-500" />
                      <ThumbsDown className="h-3.5 w-3.5 text-red-400" />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {/* Toggle active */}
                      <button
                        onClick={() =>
                          toggleMutation.mutate({ id: survey.id, active: !isActive })
                        }
                        className={cn(
                          'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-3)] hover:bg-[var(--bg-muted)]',
                        )}
                      >
                        {isActive ? 'Aktif' : 'Nonaktif'}
                      </button>

                      {/* WhatsApp share */}
                      <a
                        href={buildWhatsAppLink(survey)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg p-1.5 text-[var(--text-3)] hover:bg-emerald-50 hover:text-emerald-600"
                        title="Bagikan via WhatsApp"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </a>

                      {/* Expand results */}
                      <button
                        onClick={() => setExpandedId(expanded ? null : survey.id)}
                        className="rounded-lg p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-subtle)]"
                      >
                        {expanded
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />
                        }
                      </button>
                    </div>
                  </div>

                  {/* Expanded results */}
                  {expanded && (
                    <div className="border-t border-[var(--border)] bg-[var(--bg-subtle)]">
                      <ResultsPanel surveyId={survey.id} storeId={storeId} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* NPS legend */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-1)]">Cara Membaca NPS</h3>
        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          <div className="rounded-xl bg-emerald-50 p-3">
            <ThumbsUp className="mx-auto mb-1 h-5 w-5 text-emerald-500" />
            <p className="font-semibold text-emerald-700">Promoter</p>
            <p className="text-emerald-600">Skor 9–10</p>
            <p className="mt-1 text-emerald-500">Pelanggan loyal yang aktif merekomendasikan</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-3">
            <Minus className="mx-auto mb-1 h-5 w-5 text-amber-500" />
            <p className="font-semibold text-amber-700">Passive</p>
            <p className="text-amber-600">Skor 7–8</p>
            <p className="mt-1 text-amber-500">Puas tapi tidak antusias merekomendasikan</p>
          </div>
          <div className="rounded-xl bg-red-50 p-3">
            <ThumbsDown className="mx-auto mb-1 h-5 w-5 text-red-500" />
            <p className="font-semibold text-red-700">Detractor</p>
            <p className="text-red-600">Skor 0–6</p>
            <p className="mt-1 text-red-500">Tidak puas dan dapat merusak reputasi</p>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-[var(--text-3)]">
          NPS = % Promoter − % Detractor · Rentang: −100 hingga +100
        </p>
      </div>

      {showCreate && (
        <CreateModal
          storeId={storeId}
          onClose={() => setShowCreate(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['nps-surveys', storeId] })}
        />
      )}
    </div>
  )
}
