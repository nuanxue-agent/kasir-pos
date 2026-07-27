'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Crown, Users, Gift, Plus, X, Star } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoyaltyTier {
  id: string
  storeId: string
  name: string
  minPoints: number
  discount: number
  color: string
  icon: string
  createdAt: string
}

interface LoyaltyMember {
  id: string
  name: string
  phone: string | null
  email: string | null
  points: number
  createdAt: string
}

interface LoyaltyRedemption {
  id: string
  customerName: string
  pointsRedeemed: number
  discountGiven: number
  createdAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ef4444', // red
  '#ec4899', // pink
]

const inputCls =
  'w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

type Tab = 'Tiers' | 'Members' | 'Redemptions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTierForMember(points: number, tiers: LoyaltyTier[]): LoyaltyTier | null {
  if (!tiers.length) return null
  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints)
  let matched: LoyaltyTier | null = null
  for (const t of sorted) {
    if (points >= t.minPoints) matched = t
  }
  return matched
}

function getNextTier(points: number, tiers: LoyaltyTier[]): LoyaltyTier | null {
  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints)
  return sorted.find((t) => t.minPoints > points) ?? null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LoyaltyPageClient({ storeId, currency }: { storeId: string; currency: string }) {
  const [tab, setTab] = useState<Tab>('Tiers')
  const [showNewTier, setShowNewTier] = useState(false)
  const qc = useQueryClient()

  const tabs: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: 'Tiers', icon: <Crown size={16} />, label: 'Tiers' },
    { key: 'Members', icon: <Users size={16} />, label: 'Members' },
    { key: 'Redemptions', icon: <Gift size={16} />, label: 'Redemptions' },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Loyalty Program</h1>
          <p className="text-stone-500 mt-1 text-sm">Manage tiers, members, and redemptions</p>
        </div>
        {tab === 'Tiers' && (
          <button
            onClick={() => setShowNewTier(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Tier
          </button>
        )}
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-stone-100 p-1 rounded-xl w-fit">
        {tabs.map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? 'bg-white text-stone-800 shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Tiers' && (
        <TiersTab storeId={storeId} onRefresh={() => qc.invalidateQueries({ queryKey: ['loyalty-tiers', storeId] })} />
      )}
      {tab === 'Members' && <MembersTab storeId={storeId} />}
      {tab === 'Redemptions' && <RedemptionsTab storeId={storeId} currency={currency} />}

      {/* New Tier Modal */}
      {showNewTier && (
        <NewTierModal
          storeId={storeId}
          onClose={() => setShowNewTier(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['loyalty-tiers', storeId] })
            setShowNewTier(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Tiers Tab ────────────────────────────────────────────────────────────────

function TiersTab({ storeId, onRefresh }: { storeId: string; onRefresh: () => void }) {
  const { data, isLoading } = useQuery<LoyaltyTier[]>({
    queryKey: ['loyalty-tiers', storeId],
    queryFn: () => fetch(`/api/loyalty-tiers?storeId=${storeId}`).then((r) => r.json()),
  })

  const tiers: LoyaltyTier[] = data ?? []

  if (isLoading) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-36 bg-stone-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (tiers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-stone-400">
        <Crown size={48} strokeWidth={1} className="mb-4" />
        <p className="text-base font-medium text-stone-500">No tiers yet</p>
        <p className="text-sm mt-1">Create your first loyalty tier to get started.</p>
      </div>
    )
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {tiers.map((tier) => (
        <TierCard key={tier.id} tier={tier} />
      ))}
    </div>
  )
}

function TierCard({ tier }: { tier: LoyaltyTier }) {
  return (
    <div className="bg-white border border-stone-100 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{tier.icon}</span>
          <div>
            <p className="font-semibold text-stone-800">{tier.name}</p>
            <p className="text-xs text-stone-400">from {tier.minPoints.toLocaleString()} pts</p>
          </div>
        </div>
        {/* Color swatch */}
        <div
          className="w-5 h-5 rounded-full ring-2 ring-offset-1 ring-stone-200 shrink-0"
          style={{ backgroundColor: tier.color }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span
          className="text-xs px-2.5 py-1 rounded-full font-semibold"
          style={{ backgroundColor: `${tier.color}22`, color: tier.color }}
        >
          {tier.discount}% discount
        </span>
      </div>
    </div>
  )
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

function MembersTab({ storeId }: { storeId: string }) {
  const { data: membersData, isLoading: membersLoading } = useQuery<LoyaltyMember[]>({
    queryKey: ['loyalty-members', storeId],
    queryFn: () => fetch(`/api/loyalty-members?storeId=${storeId}&limit=100`).then((r) => r.json()),
  })

  const { data: tiersData, isLoading: tiersLoading } = useQuery<LoyaltyTier[]>({
    queryKey: ['loyalty-tiers', storeId],
    queryFn: () => fetch(`/api/loyalty-tiers?storeId=${storeId}`).then((r) => r.json()),
  })

  const members: LoyaltyMember[] = membersData ?? []
  const tiers: LoyaltyTier[] = tiersData ?? []
  const isLoading = membersLoading || tiersLoading

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-stone-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-stone-400">
        <Users size={48} strokeWidth={1} className="mb-4" />
        <p className="text-base font-medium text-stone-500">No members yet</p>
        <p className="text-sm mt-1">Customers who earn points will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {members.map((member) => (
        <MemberRow key={member.id} member={member} tiers={tiers} />
      ))}
    </div>
  )
}

function MemberRow({ member, tiers }: { member: LoyaltyMember; tiers: LoyaltyTier[] }) {
  const currentTier = getTierForMember(member.points, tiers)
  const nextTier = getNextTier(member.points, tiers)

  // Progress toward next tier
  const progressPct = nextTier
    ? Math.min(
        100,
        Math.round(
          ((member.points - (currentTier?.minPoints ?? 0)) /
            (nextTier.minPoints - (currentTier?.minPoints ?? 0))) *
            100
        )
      )
    : 100

  return (
    <div className="bg-white border border-stone-100 rounded-xl p-4 flex items-center gap-4 shadow-sm">
      {/* Avatar */}
      <div className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
        {member.name[0]?.toUpperCase() ?? '?'}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-stone-800 text-sm">{member.name}</p>
          {currentTier && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: `${currentTier.color}22`, color: currentTier.color }}
            >
              {currentTier.icon} {currentTier.name}
            </span>
          )}
        </div>
        <p className="text-xs text-stone-400 mt-0.5">{member.phone ?? member.email ?? '—'}</p>

        {/* Tier progress bar */}
        {nextTier && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
              <span>{member.points.toLocaleString()} pts</span>
              <span>{nextTier.minPoints.toLocaleString()} pts for {nextTier.icon} {nextTier.name}</span>
            </div>
            <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: currentTier?.color ?? '#f59e0b',
                }}
              />
            </div>
          </div>
        )}
        {!nextTier && currentTier && (
          <p className="text-xs text-amber-600 mt-1 font-medium">🏆 Max tier reached</p>
        )}
      </div>

      {/* Points badge */}
      <div className="shrink-0 text-right">
        <p className="text-lg font-bold text-stone-800">{member.points.toLocaleString()}</p>
        <p className="text-xs text-stone-400">points</p>
      </div>
    </div>
  )
}

// ─── Redemptions Tab ──────────────────────────────────────────────────────────

function RedemptionsTab({ storeId, currency }: { storeId: string; currency: string }) {
  const { data, isLoading } = useQuery<LoyaltyRedemption[]>({
    queryKey: ['loyalty-redemptions', storeId],
    queryFn: () => fetch(`/api/loyalty-redemptions?storeId=${storeId}&limit=50`).then((r) => r.json()),
  })

  const redemptions: LoyaltyRedemption[] = data ?? []

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-stone-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (redemptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-stone-400">
        <Gift size={48} strokeWidth={1} className="mb-4" />
        <p className="text-base font-medium text-stone-500">No redemptions yet</p>
        <p className="text-sm mt-1">Points redemptions will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="grid grid-cols-4 gap-2 px-4 text-xs font-medium text-stone-400 uppercase tracking-wide">
        <span>Customer</span>
        <span className="text-right">Points</span>
        <span className="text-right">Discount</span>
        <span className="text-right">Date</span>
      </div>

      {redemptions.map((r) => (
        <div
          key={r.id}
          className="bg-white border border-stone-100 rounded-xl px-4 py-3 grid grid-cols-4 gap-2 items-center shadow-sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xs font-bold shrink-0">
              {r.customerName?.[0]?.toUpperCase() ?? '?'}
            </div>
            <p className="text-sm font-medium text-stone-700 truncate">{r.customerName ?? '—'}</p>
          </div>
          <div className="text-right">
            <span className="text-sm font-semibold text-rose-500">−{r.pointsRedeemed.toLocaleString()}</span>
            <span className="text-xs text-stone-400 ml-1">pts</span>
          </div>
          <div className="text-right text-sm font-medium text-emerald-600">
            {formatCurrency(r.discountGiven, currency)}
          </div>
          <div className="text-right text-xs text-stone-400">{formatDate(r.createdAt)}</div>
        </div>
      ))}
    </div>
  )
}

// ─── New Tier Modal ───────────────────────────────────────────────────────────

function NewTierModal({
  storeId,
  onClose,
  onSuccess,
}: {
  storeId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    icon: '⭐',
    minPoints: 0,
    discount: 5,
    color: PRESET_COLORS[0],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Tier name is required')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/loyalty-tiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...form }),
      })
      if (!res.ok) {
        const d = await res.json() as any
        setError(d.error || 'Failed to create tier')
        return
      }
      onSuccess()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md border border-stone-100 shadow-xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
            <Star size={18} className="text-amber-500" />
            New Loyalty Tier
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Tier name */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Tier Name *</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Silver, Gold, Platinum"
              className={inputCls}
            />
          </div>

          {/* Icon */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Icon (emoji)</label>
            <input
              value={form.icon}
              onChange={(e) => set('icon', e.target.value)}
              placeholder="⭐"
              className={inputCls}
              maxLength={4}
            />
          </div>

          {/* Min points */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Minimum Points</label>
            <input
              type="number"
              min={0}
              value={form.minPoints}
              onChange={(e) => set('minPoints', Number(e.target.value))}
              className={inputCls}
            />
          </div>

          {/* Discount */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Discount (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={form.discount}
              onChange={(e) => set('discount', Number(e.target.value))}
              className={inputCls}
            />
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-2">Color</label>
            <div className="flex gap-2.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('color', c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    form.color === c
                      ? 'ring-2 ring-offset-2 ring-stone-400 scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-stone-50 rounded-xl p-3 flex items-center gap-3 border border-stone-100">
            <span className="text-xl">{form.icon || '⭐'}</span>
            <div>
              <p className="text-sm font-semibold text-stone-800">{form.name || 'Tier Name'}</p>
              <p className="text-xs text-stone-400">
                {form.minPoints.toLocaleString()} pts · {form.discount}% off
              </p>
            </div>
            <div
              className="ml-auto w-4 h-4 rounded-full ring-1 ring-stone-200"
              style={{ backgroundColor: form.color }}
            />
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-500 hover:text-stone-700 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-stone-200 disabled:text-stone-400 text-white text-sm font-medium transition-colors"
          >
            {loading ? 'Creating…' : 'Create Tier'}
          </button>
        </div>
      </div>
    </div>
  )
}
