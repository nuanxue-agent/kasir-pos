'use client'

import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Plus,
  Search,
  Phone,
  Mail,
  Building2,
  Calendar,
  DollarSign,
  Target,
  TrendingUp,
  Award,
  Users,
  LayoutList,
  Kanban,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface CRMPageClientProps {
  storeId: string
  currency: string
}

type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'
type ViewMode = 'list' | 'pipeline'

const PIPELINE_STAGES: { value: LeadStatus; label: string; color: string; headerBg: string }[] = [
  {
    value: 'NEW',
    label: 'Lead',
    color: 'bg-[var(--bg-muted)] text-[var(--text-2)]',
    headerBg: 'bg-[var(--bg-muted)]',
  },
  {
    value: 'CONTACTED',
    label: 'Dihubungi',
    color: 'bg-blue-50 text-blue-600',
    headerBg: 'bg-blue-50',
  },
  {
    value: 'QUALIFIED',
    label: 'Qualified',
    color: 'bg-purple-50 text-purple-600',
    headerBg: 'bg-purple-50',
  },
  {
    value: 'PROPOSAL',
    label: 'Proposal',
    color: 'bg-amber-50 text-amber-600',
    headerBg: 'bg-amber-50',
  },
  {
    value: 'WON',
    label: 'Menang',
    color: 'bg-emerald-50 text-emerald-600',
    headerBg: 'bg-emerald-50',
  },
  { value: 'LOST', label: 'Kalah', color: 'bg-red-50 text-red-500', headerBg: 'bg-red-50' },
]

// Funnel transitions: each pair we want to show conversion %
const FUNNEL_TRANSITIONS: { from: LeadStatus; to: LeadStatus; label: string }[] = [
  { from: 'NEW', to: 'CONTACTED', label: 'Lead → Dihubungi' },
  { from: 'CONTACTED', to: 'QUALIFIED', label: 'Dihubungi → Qualified' },
  { from: 'QUALIFIED', to: 'PROPOSAL', label: 'Qualified → Proposal' },
  { from: 'PROPOSAL', to: 'WON', label: 'Proposal → Menang' },
]

const PRIORITY_CONFIG = {
  LOW: { label: 'Rendah', dot: 'bg-stone-300' },
  MEDIUM: { label: 'Sedang', dot: 'bg-amber-500' },
  HIGH: { label: 'Tinggi', dot: 'bg-red-500' },
}

/** Returns how many leads at `from` stage eventually reached `to` stage or beyond.
 *  We approximate: count of leads at `to` stage (or later) as a % of leads that
 *  entered `from` stage (i.e. reached `from` or later). */
export function calcFunnelConversion(
  leads: any[],
  from: LeadStatus,
  to: LeadStatus,
  stageOrder: LeadStatus[],
): number {
  const fromIdx = stageOrder.indexOf(from)
  const toIdx = stageOrder.indexOf(to)
  if (fromIdx === -1 || toIdx === -1) return 0

  // Leads that reached `from` or later (excluding LOST if it appears before to)
  const atFrom = leads.filter(l => {
    const idx = stageOrder.indexOf(l.status as LeadStatus)
    return idx >= fromIdx
  }).length

  if (atFrom === 0) return 0

  const atTo = leads.filter(l => {
    const idx = stageOrder.indexOf(l.status as LeadStatus)
    return idx >= toIdx
  }).length

  return Math.round((atTo / atFrom) * 100)
}

/** Calculate total value of leads in a specific stage */
export function calcColumnTotalValue(leads: any[], stage: LeadStatus): number {
  return leads.filter(l => l.status === stage).reduce((s: number, l: any) => s + (l.value ?? 0), 0)
}

/** Calculate funnel drop-off % between two consecutive stages */
export function calcFunnelDropOff(
  leads: any[],
  from: LeadStatus,
  to: LeadStatus,
  stageOrder: LeadStatus[],
): number {
  return 100 - calcFunnelConversion(leads, from, to, stageOrder)
}

/** Validate that a stage transition is allowed */
export function isValidStageTransition(from: LeadStatus, to: LeadStatus): boolean {
  // Can move to any stage except impossible backwards into terminal stages logic
  // Terminal stages can be set from anywhere (won/lost deal), but won/lost cannot advance further
  const validStages: LeadStatus[] = [
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'PROPOSAL',
    'NEGOTIATION',
    'WON',
    'LOST',
  ]
  return validStages.includes(from) && validStages.includes(to) && from !== to
}

export default function CRMPageClient({ storeId, currency }: CRMPageClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [dragOverStage, setDragOverStage] = useState<LeadStatus | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline')

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', storeId],
    queryFn: () => fetch(`/api/leads?storeId=${storeId}`).then(r => r.json()),
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) =>
      fetch(`/api/leads/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })

  const filtered = (leads as any[]).filter(
    (l: any) =>
      !search ||
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.company?.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase()),
  )

  const grouped = PIPELINE_STAGES.reduce(
    (acc, stage) => {
      acc[stage.value] = filtered.filter((l: any) => l.status === stage.value)
      return acc
    },
    {} as Record<LeadStatus, any[]>,
  )

  // ── Conversion stats ────────────────────────────────────────────────────────
  const totalLeads = (leads as any[]).length
  const wonCount = (leads as any[]).filter((l: any) => l.status === 'WON').length
  const lostCount = (leads as any[]).filter((l: any) => l.status === 'LOST').length
  const closedCount = wonCount + lostCount
  const conversionRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0
  const activeLeads = totalLeads - lostCount

  const totalValue = filtered
    .filter((l: any) => l.status !== 'LOST')
    .reduce((s: number, l: any) => s + (l.value ?? 0), 0)
  const weightedValue = filtered
    .filter((l: any) => l.status !== 'LOST')
    .reduce((s: number, l: any) => s + ((l.value ?? 0) * (l.probability ?? 0)) / 100, 0)

  // Stage order for funnel calculations (pipeline stages only, no NEGOTIATION in display)
  const STAGE_ORDER: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST']

  function handleDrop(leadId: string, newStatus: LeadStatus) {
    updateStatus.mutate({ id: leadId, status: newStatus })
  }

  // ── List view (table) ────────────────────────────────────────────────────────
  const ListView = () => (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
            <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[var(--text-3)] uppercase">
              Nama
            </th>
            <th className="hidden px-4 py-3 text-left text-xs font-semibold tracking-wide text-[var(--text-3)] uppercase sm:table-cell">
              Telepon
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[var(--text-3)] uppercase">
              Stage
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-[var(--text-3)] uppercase">
              Nilai
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={4} className="py-10 text-center text-sm text-[var(--text-3)]">
                Belum ada lead
              </td>
            </tr>
          )}
          {filtered.map((lead: any) => {
            const stageCfg =
              PIPELINE_STAGES.find(s => s.value === lead.status) ?? PIPELINE_STAGES[0]
            return (
              <tr
                key={lead.id}
                className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-subtle)]"
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-[var(--text-1)]">{lead.name}</p>
                  {lead.company && <p className="text-xs text-[var(--text-3)]">{lead.company}</p>}
                </td>
                <td className="hidden px-4 py-3 text-[var(--text-2)] sm:table-cell">
                  {lead.phone ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn('rounded-full px-2 py-0.5 text-xs font-medium', stageCfg.color)}
                  >
                    {stageCfg.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-[var(--text-1)]">
                  {lead.value > 0 ? formatCurrency(lead.value, currency) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  // ── Pipeline / Kanban view ────────────────────────────────────────────────────
  const PipelineView = () => (
    <div className="space-y-4">
      {/* Funnel conversion stats bar */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <h3 className="mb-3 text-xs font-semibold tracking-wide text-[var(--text-3)] uppercase">
          Konversi Funnel
        </h3>
        <div className="flex flex-wrap gap-2">
          {FUNNEL_TRANSITIONS.map(({ from, to, label }) => {
            const pct = calcFunnelConversion(leads as any[], from, to, STAGE_ORDER)
            const dropOff = 100 - pct
            return (
              <div
                key={`${from}-${to}`}
                className="flex min-w-[140px] flex-col gap-1 rounded-xl bg-[var(--bg-subtle)] px-3 py-2"
              >
                <span className="text-[10px] leading-tight font-medium text-[var(--text-3)]">
                  {label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-[var(--text-1)]">{pct}%</span>
                  {dropOff > 0 && (
                    <span className="text-[10px] font-medium text-red-400">-{dropOff}%</span>
                  )}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Kanban board */}
      {isLoading ? (
        <div className="flex gap-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-96 min-w-[220px] flex-1 animate-pulse rounded-xl bg-[var(--bg-subtle)]"
            />
          ))}
        </div>
      ) : (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map(stage => {
            const stageLeads = grouped[stage.value] ?? []
            const stageValue = calcColumnTotalValue(filtered, stage.value)
            const isOver = dragOverStage === stage.value
            return (
              <div
                key={stage.value}
                onDragOver={e => {
                  e.preventDefault()
                  setDragOverStage(stage.value)
                }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={e => {
                  e.preventDefault()
                  setDragOverStage(null)
                  const leadId = e.dataTransfer.getData('leadId')
                  if (leadId) handleDrop(leadId, stage.value)
                }}
                className={cn(
                  'min-h-[480px] min-w-[220px] flex-1 snap-start rounded-xl border p-3 transition-all',
                  isOver
                    ? 'border-amber-300 bg-amber-50/80 ring-2 ring-amber-300/40'
                    : 'border-[var(--border)] bg-[var(--bg-subtle)]/50',
                )}
              >
                {/* Column header */}
                <div
                  className={cn(
                    'mb-3 flex items-center justify-between rounded-xl px-3 py-2',
                    stage.color,
                  )}
                >
                  <span className="text-xs font-bold">{stage.label}</span>
                  <span className="rounded-full bg-[var(--bg-card)]/60 px-1.5 py-0.5 text-xs font-semibold">
                    {stageLeads.length}
                  </span>
                </div>
                {stageValue > 0 && (
                  <p className="mb-2 px-1 text-[10px] font-medium text-[var(--text-3)]">
                    {formatCurrency(stageValue, currency)}
                  </p>
                )}

                {/* Cards */}
                <div className="space-y-2">
                  {stageLeads.map((lead: any) => {
                    const priorityCfg =
                      PRIORITY_CONFIG[lead.priority as keyof typeof PRIORITY_CONFIG] ??
                      PRIORITY_CONFIG.MEDIUM
                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={e => {
                          e.dataTransfer.setData('leadId', lead.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragEnd={() => setDragOverStage(null)}
                        className="cursor-move rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 transition-all select-none hover:border-stone-300 hover:shadow-md"
                      >
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <p className="line-clamp-2 text-sm font-semibold text-[var(--text-1)]">
                            {lead.name}
                          </p>
                          <div
                            className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', priorityCfg.dot)}
                          />
                        </div>
                        {lead.value > 0 && (
                          <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <DollarSign className="h-3 w-3" />
                            <span>{formatCurrency(lead.value, currency)}</span>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-1 text-xs text-[var(--text-3)]">
                            <Phone className="h-3 w-3" />
                            <span className="truncate">{lead.phone}</span>
                          </div>
                        )}
                        {!lead.phone && lead.email && (
                          <div className="flex items-center gap-1 text-xs text-[var(--text-3)]">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{lead.email}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Drop hint when column is empty */}
                  {stageLeads.length === 0 && (
                    <div
                      className={cn(
                        'rounded-xl border-2 border-dashed p-4 text-center text-xs transition-colors',
                        isOver
                          ? 'border-amber-300 text-amber-400'
                          : 'border-[var(--border)] text-stone-300',
                      )}
                    >
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-[1800px] space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">CRM Pipeline</h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">Sales funnel &amp; lead tracking</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                viewMode === 'list'
                  ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                  : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
              )}
            >
              <LayoutList className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => setViewMode('pipeline')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                viewMode === 'pipeline'
                  ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                  : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
              )}
            >
              <Kanban className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Pipeline</span>
            </button>
          </div>

          <button className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:opacity-90">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add Lead</span>
          </button>
        </div>
      </div>

      {/* ── Conversion Rate Summary ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-[var(--text-3)] uppercase">
          Conversion Summary
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {/* Win rate meter */}
          <div className="col-span-2 flex flex-col justify-between">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-[var(--text-3)]">Win Rate</span>
              <span className="text-xl font-bold text-emerald-600">{conversionRate}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-muted)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
                style={{ width: `${conversionRate}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-[var(--text-3)]">
              {wonCount} won / {closedCount} closed
            </p>
          </div>

          <div className="rounded-xl bg-[var(--bg-subtle)] p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-xs text-[var(--text-3)]">Total Leads</span>
            </div>
            <p className="text-lg font-bold text-[var(--text-1)]">{totalLeads}</p>
          </div>

          <div className="rounded-xl bg-[var(--bg-subtle)] p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs text-[var(--text-3)]">Active</span>
            </div>
            <p className="text-lg font-bold text-[var(--text-1)]">{activeLeads}</p>
          </div>

          <div className="rounded-xl bg-[var(--bg-subtle)] p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs text-[var(--text-3)]">Pipeline</span>
            </div>
            <p className="text-lg font-bold text-[var(--text-1)]">
              {formatCurrency(totalValue, currency)}
            </p>
          </div>

          <div className="rounded-xl bg-[var(--bg-subtle)] p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <Award className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-xs text-[var(--text-3)]">Weighted</span>
            </div>
            <p className="text-lg font-bold text-[var(--text-1)]">
              {formatCurrency(weightedValue, currency)}
            </p>
          </div>
        </div>

        {/* Stage funnel bar */}
        <div
          className="mt-4 flex h-6 gap-0.5 overflow-hidden rounded-lg"
          aria-label="Pipeline funnel"
        >
          {PIPELINE_STAGES.filter(s => s.value !== 'LOST').map(stage => {
            const count = grouped[stage.value]?.length ?? 0
            const pct = totalLeads > 0 ? (count / totalLeads) * 100 : 0
            if (pct === 0) return null
            return (
              <div
                key={stage.value}
                title={`${stage.label}: ${count}`}
                className={cn(
                  'flex items-center justify-center text-xs font-semibold transition-all',
                  stage.color,
                )}
                style={{ width: `${pct}%`, minWidth: count > 0 ? 24 : 0 }}
              >
                {count > 0 && count}
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          {PIPELINE_STAGES.map(s => (
            <span
              key={s.value}
              className={cn('rounded-full px-2 py-0.5 text-xs font-medium', s.color)}
            >
              {s.label} ({grouped[s.value]?.length ?? 0})
            </span>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-2.5 pr-4 pl-9 text-sm text-[var(--text-1)] placeholder-stone-400 shadow-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none"
          placeholder="Search leads…"
        />
      </div>

      {/* ── View ─────────────────────────────────────────────────────────────── */}
      {viewMode === 'pipeline' ? <PipelineView /> : <ListView />}
    </div>
  )
}
