'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList,
  Plus,
  X,
  BarChart2,
  Send,
  CheckCircle,
  Clock,
  Lock,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  isValidStatusTransition,
  aggregateResponses,
  calcCompletionRate,
  validateQuestions,
  isSurveyOpen,
  sanitizeResponseForAnonymous,
  type Survey,
  type SurveyStatus,
  type SurveyType,
  type SurveyQuestion,
  type QuestionType,
  type QuestionAggregate,
} from '@/lib/surveys'

// ─── re-export pure functions for unit tests ───────────────────────────────────
export {
  isValidStatusTransition,
  aggregateResponses,
  calcCompletionRate,
  validateQuestions,
  isSurveyOpen,
  sanitizeResponseForAnonymous,
}
export type { SurveyStatus, SurveyType, SurveyQuestion, QuestionType, QuestionAggregate }

// ─── helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all'

const selectCls = inputCls + ' cursor-pointer'

const STATUS_COLORS: Record<SurveyStatus, string> = {
  DRAFT:  'bg-stone-500/15 text-stone-400',
  ACTIVE: 'bg-emerald-500/15 text-emerald-400',
  CLOSED: 'bg-slate-500/15 text-slate-400',
}

const TYPE_COLORS: Record<SurveyType, string> = {
  SATISFACTION: 'bg-blue-500/15 text-blue-400',
  PULSE:        'bg-purple-500/15 text-purple-400',
  EXIT:         'bg-red-500/15 text-red-400',
  ONBOARDING:   'bg-emerald-500/15 text-emerald-400',
}

const STATUS_ICONS: Record<SurveyStatus, React.ReactNode> = {
  DRAFT:  <Clock size={12} />,
  ACTIVE: <CheckCircle size={12} />,
  CLOSED: <Lock size={12} />,
}

const QUESTION_TYPES: QuestionType[] = ['RATING', 'TEXT', 'MULTIPLE_CHOICE', 'YES_NO', 'SCALE']

// ─── types ────────────────────────────────────────────────────────────────────

interface SurveyClientProps {
  storeId: string
}

type Tab = 'list' | 'create' | 'results'

interface ResultsData {
  surveyId: string
  title: string
  type: SurveyType
  status: SurveyStatus
  anonymous: boolean
  totalResponses: number
  completionRate: number
  aggregates: QuestionAggregate[]
  trend: { date: string; count: number }[]
}

// ─── question builder ─────────────────────────────────────────────────────────

function QuestionBuilder({
  questions,
  onChange,
}: {
  questions: SurveyQuestion[]
  onChange: (qs: SurveyQuestion[]) => void
}) {
  const addQuestion = () => {
    onChange([
      ...questions,
      { id: `q-${Date.now()}`, type: 'RATING', text: '', required: true, min: 1, max: 5 },
    ])
  }

  const removeQuestion = (idx: number) => {
    onChange(questions.filter((_, i) => i !== idx))
  }

  const updateQuestion = (idx: number, patch: Partial<SurveyQuestion>) => {
    onChange(questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
  }

  return (
    <div className="space-y-3">
      {questions.map((q, idx) => (
        <div
          key={q.id}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 space-y-3"
        >
          <div className="flex items-start gap-2">
            <span className="text-xs text-[var(--text-3)] mt-2.5 w-5 shrink-0">{idx + 1}.</span>
            <div className="flex-1 space-y-2">
              <input
                className={inputCls}
                placeholder="Question text…"
                value={q.text}
                onChange={e => updateQuestion(idx, { text: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                <select
                  className={selectCls + ' max-w-[170px]'}
                  value={q.type}
                  onChange={e =>
                    updateQuestion(idx, { type: e.target.value as QuestionType })
                  }
                >
                  {QUESTION_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-2)]">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={e => updateQuestion(idx, { required: e.target.checked })}
                    className="accent-blue-500"
                  />
                  Required
                </label>
              </div>
              {(q.type === 'RATING' || q.type === 'SCALE') && (
                <div className="flex gap-2">
                  <input
                    type="number"
                    className={inputCls + ' max-w-[90px]'}
                    placeholder="Min"
                    value={q.min ?? 1}
                    onChange={e => updateQuestion(idx, { min: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    className={inputCls + ' max-w-[90px]'}
                    placeholder="Max"
                    value={q.max ?? 5}
                    onChange={e => updateQuestion(idx, { max: Number(e.target.value) })}
                  />
                </div>
              )}
              {q.type === 'MULTIPLE_CHOICE' && (
                <textarea
                  className={inputCls}
                  placeholder="Options, one per line"
                  rows={3}
                  value={(q.options ?? []).join('\n')}
                  onChange={e =>
                    updateQuestion(idx, {
                      options: e.target.value.split('\n').filter(Boolean),
                    })
                  }
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => removeQuestion(idx)}
              className="text-[var(--text-3)] hover:text-red-400 mt-1 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addQuestion}
        className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
      >
        <Plus size={14} /> Add question
      </button>
    </div>
  )
}

// ─── results panel ────────────────────────────────────────────────────────────

function ResultsPanel({ data }: { data: ResultsData }) {
  const maxTrend = Math.max(...data.trend.map(t => t.count), 1)

  return (
    <div className="space-y-6">
      {/* summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-xs text-[var(--text-3)] mb-1">Total Responses</p>
          <p className="text-2xl font-bold text-[var(--text-1)]">{data.totalResponses}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-xs text-[var(--text-3)] mb-1">Completion Rate</p>
          <p className="text-2xl font-bold text-[var(--text-1)]">{data.completionRate}%</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-xs text-[var(--text-3)] mb-1">Anonymous</p>
          <p className="text-2xl font-bold text-[var(--text-1)]">{data.anonymous ? 'Yes' : 'No'}</p>
        </div>
      </div>

      {/* trend bar chart */}
      {data.trend.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-sm font-semibold text-[var(--text-1)] mb-3">Response Trend</p>
          <div className="flex items-end gap-1 h-24 overflow-x-auto">
            {data.trend.map(t => (
              <div key={t.date} className="flex flex-col items-center gap-0.5 min-w-[32px]">
                <span className="text-[10px] text-[var(--text-3)]">{t.count}</span>
                <div
                  className="w-6 rounded-t bg-blue-500/70"
                  style={{ height: `${Math.max(4, (t.count / maxTrend) * 80)}px` }}
                />
                <span className="text-[9px] text-[var(--text-3)] whitespace-nowrap">
                  {t.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* per-question aggregates */}
      <div className="space-y-3">
        {data.aggregates.map((agg, i) => (
          <div
            key={agg.questionId}
            className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-[var(--text-1)]">
                {i + 1}. {agg.questionText}
              </p>
              <span className="text-xs text-[var(--text-3)] shrink-0">{agg.totalAnswers} answers</span>
            </div>
            {agg.average !== undefined && (
              <p className="text-sm text-[var(--text-2)]">
                Avg: <span className="font-semibold text-blue-400">{agg.average}</span>
                <span className="text-[var(--text-3)]"> · min {agg.min} · max {agg.max}</span>
              </p>
            )}
            {agg.optionCounts && (
              <div className="space-y-1">
                {Object.entries(agg.optionCounts).map(([opt, cnt]) => (
                  <div key={opt} className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500/70 rounded-full"
                        style={{
                          width: `${agg.totalAnswers > 0 ? (cnt / agg.totalAnswers) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-[var(--text-2)] w-20 truncate">{opt}</span>
                    <span className="text-xs text-[var(--text-3)] w-6 text-right">{cnt}</span>
                  </div>
                ))}
              </div>
            )}
            {agg.textSamples && agg.textSamples.length > 0 && (
              <div className="space-y-1">
                {agg.textSamples.map((s, j) => (
                  <p key={j} className="text-xs text-[var(--text-2)] italic">"{s}"</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function SurveyClient({ storeId }: SurveyClientProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'PULSE' as SurveyType,
    startDate: '',
    endDate: '',
    anonymous: true,
    questions: [] as SurveyQuestion[],
  })

  // ── queries ──
  const { data: surveysData, isLoading } = useQuery({
    queryKey: ['hr-surveys', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/surveys?storeId=${storeId}`)
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json.data as Survey[]
    },
  })

  const { data: resultsData, isLoading: resultsLoading } = useQuery({
    queryKey: ['hr-survey-results', selectedId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/surveys/${selectedId}/results?storeId=${storeId}`)
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json as ResultsData
    },
    enabled: !!selectedId && tab === 'results',
  })

  // ── mutations ──
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/hr/surveys?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      toast.success('Survey created')
      qc.invalidateQueries({ queryKey: ['hr-surveys', storeId] })
      setTab('list')
      setForm({ title: '', description: '', type: 'PULSE', startDate: '', endDate: '', anonymous: true, questions: [] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SurveyStatus }) => {
      const res = await fetch(`/api/hr/surveys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      toast.success('Survey updated')
      qc.invalidateQueries({ queryKey: ['hr-surveys', storeId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const surveys = surveysData ?? []

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const qErr = validateQuestions(form.questions)
    if (qErr) { toast.error(qErr); return }
    createMutation.mutate()
  }

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/15">
            <ClipboardList size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-1)]">Employee Surveys</h1>
            <p className="text-xs text-[var(--text-3)]">Pulse checks & satisfaction surveys</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(['list', 'create'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                tab === t
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-[var(--text-2)] hover:text-[var(--text-1)]',
              )}
            >
              {t === 'list' ? 'Surveys' : 'New Survey'}
            </button>
          ))}
        </div>
      </div>

      {/* create form */}
      {tab === 'create' && (
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h2 className="font-semibold text-[var(--text-1)]">Create Survey</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--text-2)] mb-1">Title *</label>
              <input
                required
                className={inputCls}
                placeholder="e.g. Monthly Pulse Check"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[var(--text-2)] mb-1">Description</label>
              <textarea
                className={inputCls}
                rows={2}
                placeholder="Optional description shown to respondents…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-2)] mb-1">Type</label>
              <select
                className={selectCls}
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as SurveyType }))}
              >
                {(['SATISFACTION', 'PULSE', 'EXIT', 'ONBOARDING'] as SurveyType[]).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                <input
                  type="checkbox"
                  checked={form.anonymous}
                  onChange={e => setForm(f => ({ ...f, anonymous: e.target.checked }))}
                  className="accent-blue-500"
                />
                Anonymous responses
              </label>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-2)] mb-1">Start Date *</label>
              <input
                required
                type="date"
                className={inputCls}
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-2)] mb-1">End Date *</label>
              <input
                required
                type="date"
                className={inputCls}
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-2)] mb-2">Questions</label>
            <QuestionBuilder
              questions={form.questions}
              onChange={qs => setForm(f => ({ ...f, questions: qs }))}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setTab('list')}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60 transition-colors"
            >
              <Send size={14} />
              {createMutation.isPending ? 'Saving…' : 'Create Survey'}
            </button>
          </div>
        </form>
      )}

      {/* results panel */}
      {tab === 'results' && selectedId && (
        <div className="space-y-4">
          <button
            onClick={() => { setTab('list'); setSelectedId(null) }}
            className="text-sm text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
          >
            ← Back to surveys
          </button>
          {resultsLoading ? (
            <p className="text-sm text-[var(--text-3)]">Loading results…</p>
          ) : resultsData ? (
            <>
              <h2 className="font-semibold text-[var(--text-1)]">{resultsData.title}</h2>
              <ResultsPanel data={resultsData} />
            </>
          ) : null}
        </div>
      )}

      {/* survey list */}
      {tab === 'list' && (
        <div className="space-y-3">
          {isLoading && (
            <p className="text-sm text-[var(--text-3)]">Loading…</p>
          )}
          {!isLoading && surveys.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center">
              <ClipboardList size={32} className="mx-auto mb-3 text-[var(--text-3)]" />
              <p className="text-sm text-[var(--text-2)]">No surveys yet</p>
              <button
                onClick={() => setTab('create')}
                className="mt-3 flex items-center gap-1.5 mx-auto text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Plus size={14} /> Create first survey
              </button>
            </div>
          )}
          {surveys.map(s => {
            const expanded = expandedId === s.id
            return (
              <div
                key={s.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => setExpandedId(expanded ? null : s.id)}
                    className="flex-1 flex items-start gap-3 text-left"
                  >
                    <div className="mt-0.5">
                      {expanded ? (
                        <ChevronUp size={14} className="text-[var(--text-3)]" />
                      ) : (
                        <ChevronDown size={14} className="text-[var(--text-3)]" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--text-1)]">{s.title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_COLORS[s.status as SurveyStatus])}>
                          {STATUS_ICONS[s.status as SurveyStatus]}
                          {s.status}
                        </span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', TYPE_COLORS[s.type as SurveyType])}>
                          {s.type}
                        </span>
                        <span className="text-[10px] text-[var(--text-3)]">
                          {s.startDate} – {s.endDate}
                        </span>
                        {s.anonymous && (
                          <span className="text-[10px] text-[var(--text-3)]">Anon</span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.status === 'DRAFT' && (
                      <button
                        onClick={() => statusMutation.mutate({ id: s.id, status: 'ACTIVE' })}
                        className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                      >
                        Activate
                      </button>
                    )}
                    {s.status === 'ACTIVE' && (
                      <button
                        onClick={() => statusMutation.mutate({ id: s.id, status: 'CLOSED' })}
                        className="rounded-lg bg-slate-500/15 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-500/25 transition-colors"
                      >
                        Close
                      </button>
                    )}
                    <button
                      onClick={() => { setSelectedId(s.id); setTab('results') }}
                      className="flex items-center gap-1 rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/25 transition-colors"
                    >
                      <BarChart2 size={12} /> Results
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-[var(--border)] px-4 py-3">
                    {s.description && (
                      <p className="text-xs text-[var(--text-2)] mb-2">{s.description}</p>
                    )}
                    <p className="text-xs text-[var(--text-3)] mb-2">
                      {(s as any).questions?.length ?? 0} question(s)
                    </p>
                    <div className="space-y-1">
                      {((s as any).questions as SurveyQuestion[]).map((q, i) => (
                        <div key={q.id} className="flex items-start gap-2 text-xs text-[var(--text-2)]">
                          <span className="text-[var(--text-3)] shrink-0">{i + 1}.</span>
                          <span className="flex-1">{q.text}</span>
                          <span className="text-[var(--text-3)] shrink-0">[{q.type}]</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
