'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Crown,
  Trophy,
  Star,
  TrendingUp,
  Award,
  ChevronRight,
  Users,
  Medal,
} from 'lucide-react'
import {
  getCurrentTier,
  getNextTier,
  getTierProgressPercent,
  getPointsToNextTier,
  DEFAULT_TIERS,
  MILESTONE_DEFS,
  type TierDef,
  type MilestoneType,
} from '@/lib/tier-progress'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerMilestone {
  id: string
  customerId: string
  type: MilestoneType
  achievedAt: string
  notified: number
}

interface LeaderboardEntry {
  rank: number
  customerId: string
  name: string
  points: number
  tierName: string
  tierIcon: string
  periodSpend: number
  periodOrders: number
}

interface LeaderboardResponse {
  period: string
  since: string
  leaderboard: LeaderboardEntry[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(n: number) {
  return new Intl.NumberFormat('id-ID').format(n)
}

function formatCurrency(n: number, currency: string) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum'] as const

const TIER_BG: Record<string, string> = {
  Bronze: 'from-amber-900/30 to-amber-700/10 border-amber-700/40',
  Silver: 'from-slate-500/30 to-slate-400/10 border-slate-400/40',
  Gold: 'from-yellow-600/30 to-yellow-400/10 border-yellow-500/40',
  Platinum: 'from-violet-700/30 to-violet-400/10 border-violet-500/40',
}

const TIER_BAR: Record<string, string> = {
  Bronze: 'bg-amber-600',
  Silver: 'bg-slate-400',
  Gold: 'bg-yellow-400',
  Platinum: 'bg-violet-400',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TierBadge({ tier, active }: { tier: TierDef; active: boolean }) {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-2 transition-all ${
        active
          ? `bg-gradient-to-b ${TIER_BG[tier.name]} ring-2 ring-offset-1 ring-offset-[var(--bg-base)]`
          : 'border-[var(--border)] opacity-40'
      }`}
      style={active ? { ['--ring-color' as string]: tier.color } as React.CSSProperties : undefined}
    >
      <span className="text-2xl">{tier.icon}</span>
      <span className="text-xs font-semibold" style={{ color: active ? tier.color : undefined }}>
        {tier.name}
      </span>
      <span className="text-[10px] text-[var(--text-3)]">
        {tier.minPoints === 0 ? 'Start' : `${formatNumber(tier.minPoints)} pts`}
      </span>
    </div>
  )
}

function ProgressBar({
  percent,
  color,
  tierName,
}: {
  percent: number
  color: string
  tierName: string
}) {
  return (
    <div className="h-3 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${TIER_BAR[tierName] ?? 'bg-amber-500'}`}
        style={{ width: `${percent}%` }}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${percent}% progress to next tier`}
      />
    </div>
  )
}

function BenefitsTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
            <th className="px-4 py-2.5 text-left text-[var(--text-2)] font-medium">Benefit</th>
            {DEFAULT_TIERS.map((t) => (
              <th
                key={t.name}
                className="px-4 py-2.5 text-center font-semibold"
                style={{ color: t.color }}
              >
                {t.icon} {t.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            { label: 'Min Points', values: DEFAULT_TIERS.map((t) => formatNumber(t.minPoints)) },
            {
              label: 'Discount',
              values: ['—', '5%', '10%', '15%'],
            },
            {
              label: 'Birthday Bonus',
              values: ['2×', '2×', '3×', '5×'],
            },
            {
              label: 'Priority Support',
              values: ['—', '✓', '✓', '✓'],
            },
            {
              label: 'Free Delivery',
              values: ['—', '—', '✓', '✓'],
            },
            {
              label: 'Exclusive Promos',
              values: ['—', '—', '✓', '✓'],
            },
            {
              label: 'Account Manager',
              values: ['—', '—', '—', '✓'],
            },
          ].map((row, i) => (
            <tr
              key={row.label}
              className={`border-b border-[var(--border)] last:border-0 ${i % 2 === 0 ? '' : 'bg-[var(--bg-subtle)]/40'}`}
            >
              <td className="px-4 py-2 text-[var(--text-2)]">{row.label}</td>
              {row.values.map((v, j) => (
                <td key={j} className="px-4 py-2 text-center text-[var(--text-1)]">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MilestoneGrid({
  achieved,
  achievedMap,
}: {
  achieved: Set<MilestoneType>
  achievedMap: Map<MilestoneType, string>
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {MILESTONE_DEFS.map((m) => {
        const done = achieved.has(m.type)
        const date = achievedMap.get(m.type)
        return (
          <div
            key={m.type}
            className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
              done
                ? 'border-amber-500/40 bg-amber-500/10'
                : 'border-[var(--border)] opacity-40 grayscale'
            }`}
          >
            <span className="text-2xl">{m.icon}</span>
            <span className="text-xs font-semibold text-[var(--text-1)]">{m.label}</span>
            <span className="text-[10px] text-[var(--text-3)]">{m.description}</span>
            {done && date && (
              <span className="text-[10px] text-amber-400">{formatDate(date)}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function LeaderboardPanel({
  storeId,
  currency,
}: {
  storeId: string
  currency: string
}) {
  const [period, setPeriod] = useState<'month' | 'week' | 'year'>('month')

  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ['loyalty-leaderboard', storeId, period],
    queryFn: async () => {
      const res = await fetch(`/api/loyalty/leaderboard?storeId=${storeId}&period=${period}`)
      if (!res.ok) throw new Error('Failed to load leaderboard')
      return res.json()
    },
    staleTime: 60_000,
  })

  const rankColor = (rank: number) => {
    if (rank === 1) return 'text-yellow-400'
    if (rank === 2) return 'text-slate-300'
    if (rank === 3) return 'text-amber-600'
    return 'text-[var(--text-3)]'
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-yellow-400" />
          <h3 className="font-semibold text-[var(--text-1)] text-sm">Leaderboard</h3>
        </div>
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
          {(['week', 'month', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 capitalize transition-colors ${
                period === p
                  ? 'bg-amber-500 text-white'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-2)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-[var(--bg-subtle)] animate-pulse" />
          ))}
        </div>
      ) : !data?.leaderboard.length ? (
        <p className="text-center text-sm text-[var(--text-3)] py-6">No data yet</p>
      ) : (
        <ol className="space-y-1.5">
          {data.leaderboard.map((entry) => (
            <li
              key={entry.customerId}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-[var(--bg-subtle)] transition-colors"
            >
              <span className={`w-5 text-center font-bold text-sm ${rankColor(entry.rank)}`}>
                {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
              </span>
              <span className="text-base">{entry.tierIcon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-1)] truncate">{entry.name}</p>
                <p className="text-[10px] text-[var(--text-3)]">
                  {formatNumber(entry.points)} pts · {entry.periodOrders} orders
                </p>
              </div>
              <span className="text-xs font-semibold text-amber-400 shrink-0">
                {formatCurrency(entry.periodSpend, currency)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  storeId: string
  currency: string
  /** When provided, shows a single customer's progress view */
  customerId?: string
  customerName?: string
  customerPoints?: number
}

export function TierProgressClient({
  storeId,
  currency,
  customerId,
  customerName,
  customerPoints = 0,
}: Props) {
  const [activeTab, setActiveTab] = useState<'progress' | 'benefits' | 'milestones'>('progress')

  // Fetch milestones if we have a customer
  const { data: milestoneData } = useQuery<{ results: CustomerMilestone[] }>({
    queryKey: ['customer-milestones', customerId, storeId],
    queryFn: async () => {
      if (!customerId) return { results: [] }
      const res = await fetch(
        `/api/customers/${customerId}/milestones?storeId=${storeId}`,
      )
      if (!res.ok) return { results: [] }
      return res.json()
    },
    enabled: !!customerId,
    staleTime: 30_000,
  })

  const milestones: CustomerMilestone[] = milestoneData?.results ?? []
  const achievedSet = new Set(milestones.map((m) => m.type))
  const achievedMap = new Map(milestones.map((m) => [m.type, m.achievedAt]))

  const points = customerPoints
  const currentTier = getCurrentTier(points, DEFAULT_TIERS)
  const nextTier = getNextTier(points, DEFAULT_TIERS)
  const progressPct = getTierProgressPercent(points, DEFAULT_TIERS)
  const pointsNeeded = getPointsToNextTier(points, DEFAULT_TIERS)

  const tabs = [
    { key: 'progress' as const, label: 'Progress', icon: <TrendingUp size={14} /> },
    { key: 'benefits' as const, label: 'Benefits', icon: <Star size={14} /> },
    { key: 'milestones' as const, label: 'Milestones', icon: <Award size={14} /> },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-amber-500/15 p-3">
          <Crown size={22} className="text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)]">
            {customerId ? `${customerName ?? 'Customer'}'s Loyalty` : 'Loyalty Tier Progress'}
          </h1>
          <p className="text-sm text-[var(--text-3)]">
            Track tier progression, badges, and top members
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Tab bar */}
          <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-subtle)] w-fit">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === t.key
                    ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm'
                    : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Progress tab */}
          {activeTab === 'progress' && (
            <div className="space-y-5">
              {/* Tier track */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-5">
                {/* Current tier summary */}
                {customerId && (
                  <div
                    className={`flex items-center gap-3 rounded-xl border p-4 bg-gradient-to-r ${TIER_BG[currentTier.name]}`}
                  >
                    <span className="text-4xl">{currentTier.icon}</span>
                    <div className="flex-1">
                      <p className="text-xs text-[var(--text-3)] uppercase tracking-wider">
                        Current Tier
                      </p>
                      <p
                        className="text-2xl font-bold"
                        style={{ color: currentTier.color }}
                      >
                        {currentTier.name}
                      </p>
                      <p className="text-sm text-[var(--text-2)]">
                        {formatNumber(points)} points
                      </p>
                    </div>
                    {nextTier && (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-[var(--text-3)]">Next tier</p>
                        <p
                          className="text-base font-semibold"
                          style={{ color: nextTier.color }}
                        >
                          {nextTier.icon} {nextTier.name}
                        </p>
                        <p className="text-xs text-[var(--text-3)]">
                          {formatNumber(pointsNeeded)} pts away
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Tier row */}
                <div className="grid grid-cols-4 gap-2">
                  {DEFAULT_TIERS.map((t) => (
                    <TierBadge
                      key={t.name}
                      tier={t}
                      active={
                        customerId
                          ? t.name === currentTier.name
                          : true
                      }
                    />
                  ))}
                </div>

                {/* Progress bar (customer view) */}
                {customerId && nextTier && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-[var(--text-3)]">
                      <span>
                        {currentTier.icon} {currentTier.name} ({formatNumber(currentTier.minPoints)})
                      </span>
                      <span>{progressPct}%</span>
                      <span>
                        {nextTier.icon} {nextTier.name} ({formatNumber(nextTier.minPoints)})
                      </span>
                    </div>
                    <ProgressBar
                      percent={progressPct}
                      color={currentTier.color}
                      tierName={currentTier.name}
                    />
                    <p className="text-center text-xs text-[var(--text-3)]">
                      Earn{' '}
                      <span className="font-semibold text-[var(--text-1)]">
                        {formatNumber(pointsNeeded)} more points
                      </span>{' '}
                      to reach{' '}
                      <span className="font-semibold" style={{ color: nextTier.color }}>
                        {nextTier.name}
                      </span>
                    </p>
                  </div>
                )}

                {customerId && !nextTier && (
                  <div className="text-center py-2">
                    <p className="text-sm font-semibold text-violet-300">
                      💎 You've reached the highest tier — Platinum!
                    </p>
                  </div>
                )}
              </div>

              {/* Tier thresholds quick reference */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
                <h3 className="text-sm font-semibold text-[var(--text-1)] flex items-center gap-2">
                  <ChevronRight size={14} className="text-amber-400" />
                  Tier Thresholds
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {DEFAULT_TIERS.map((t) => (
                    <div
                      key={t.name}
                      className={`flex items-center gap-2.5 rounded-xl border p-2.5 ${
                        customerId && currentTier.name === t.name
                          ? `bg-gradient-to-r ${TIER_BG[t.name]}`
                          : 'border-[var(--border)]'
                      }`}
                    >
                      <span className="text-xl">{t.icon}</span>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: t.color }}>
                          {t.name}
                        </p>
                        <p className="text-[10px] text-[var(--text-3)]">
                          {t.minPoints === 0
                            ? 'Entry level'
                            : `≥ ${formatNumber(t.minPoints)} pts`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Benefits tab */}
          {activeTab === 'benefits' && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--text-1)] flex items-center gap-2">
                <Star size={14} className="text-yellow-400" />
                Tier Benefits Comparison
              </h3>
              <BenefitsTable />
            </div>
          )}

          {/* Milestones tab */}
          {activeTab === 'milestones' && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-1)] flex items-center gap-2">
                  <Medal size={14} className="text-amber-400" />
                  Milestone Badges
                </h3>
                {customerId && (
                  <span className="text-xs text-[var(--text-3)]">
                    {achievedSet.size} / {MILESTONE_DEFS.length} earned
                  </span>
                )}
              </div>
              <MilestoneGrid achieved={achievedSet} achievedMap={achievedMap} />
            </div>
          )}
        </div>

        {/* Leaderboard side panel */}
        <div className="lg:col-span-1">
          <LeaderboardPanel storeId={storeId} currency={currency} />

          {/* Store-wide stats */}
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-1)] flex items-center gap-2">
              <Users size={14} className="text-blue-400" />
              Tier Distribution
            </h3>
            <div className="space-y-2">
              {DEFAULT_TIERS.map((t) => (
                <div key={t.name} className="flex items-center gap-2.5">
                  <span className="text-base w-6 text-center">{t.icon}</span>
                  <span
                    className="text-xs w-16 font-medium"
                    style={{ color: t.color }}
                  >
                    {t.name}
                  </span>
                  <div className="flex-1 h-2 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${TIER_BAR[t.name]}`}
                      style={{ width: '0%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-3)]">
              Distribution data loaded per store
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
