"use client"

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Gift, Star, ShoppingBag, Tag, Sparkles, Plus, Search,
  Loader2, RefreshCw, Check, X, ChevronDown, ChevronUp,
  History, Package, Percent, Ticket, Trophy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { formatCurrency, formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type RewardType = 'DISCOUNT' | 'FREE_ITEM' | 'VOUCHER' | 'EXPERIENCE'
type RedemptionStatus = 'PENDING' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED'

interface RewardCatalog {
  id: string
  storeId: string
  name: string
  description: string | null
  type: RewardType
  pointsCost: number
  value: number
  stock: number
  active: number
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

interface PointsRedemption {
  id: string
  storeId: string
  customerId: string
  rewardId: string
  rewardName: string | null
  rewardType: RewardType | null
  pointsSpent: number
  status: RedemptionStatus
  redeemedAt: string
  fulfilledAt: string | null
}

interface Customer {
  id: string
  name: string
  email: string | null
  loyaltyPoints?: number
}

interface RewardRedemptionClientProps {
  storeId: string
  currency?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<RewardType, string> = {
  DISCOUNT:   'Diskon',
  FREE_ITEM:  'Item Gratis',
  VOUCHER:    'Voucher',
  EXPERIENCE: 'Pengalaman',
}

const TYPE_ICON: Record<RewardType, React.ReactNode> = {
  DISCOUNT:   <Percent className="w-4 h-4" />,
  FREE_ITEM:  <Package className="w-4 h-4" />,
  VOUCHER:    <Ticket  className="w-4 h-4" />,
  EXPERIENCE: <Trophy  className="w-4 h-4" />,
}

const TYPE_COLOR: Record<RewardType, string> = {
  DISCOUNT:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
  FREE_ITEM:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  VOUCHER:    'bg-violet-500/15 text-violet-400 border-violet-500/30',
  EXPERIENCE: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
}

const STATUS_COLOR: Record<RedemptionStatus, string> = {
  PENDING:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
  FULFILLED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  EXPIRED:   'bg-stone-500/15 text-stone-400 border-stone-500/30',
  CANCELLED: 'bg-red-500/15 text-red-400 border-red-500/30',
}

const STATUS_LABEL: Record<RedemptionStatus, string> = {
  PENDING:   'Menunggu',
  FULFILLED: 'Terpenuhi',
  EXPIRED:   'Kedaluwarsa',
  CANCELLED: 'Dibatalkan',
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

export function hasEnoughPoints(balance: number, cost: number): boolean {
  return balance >= cost
}

export function isStockAvailable(stock: number): boolean {
  return stock === -1 || stock > 0
}

export function isRewardExpired(expiresAt: string | null, now = new Date()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < now
}

export function calcDiscountValue(rewardValue: number, orderTotal: number): number {
  return Math.min(rewardValue, orderTotal)
}

export function isValidTransition(from: RedemptionStatus, to: RedemptionStatus): boolean {
  const allowed: Record<RedemptionStatus, RedemptionStatus[]> = {
    PENDING:   ['FULFILLED', 'CANCELLED'],
    FULFILLED: [],
    EXPIRED:   [],
    CANCELLED: [],
  }
  return (allowed[from] ?? []).includes(to)
}

export function pointsAfterRedemption(balance: number, cost: number): number {
  if (balance < cost) throw new Error('Insufficient points')
  return balance - cost
}

export function resolveRewardLabel(reward: Pick<RewardCatalog, 'type' | 'value' | 'name'>, currency = 'IDR'): string {
  if (reward.type === 'DISCOUNT') return `Diskon ${formatCurrency(reward.value, currency)}`
  if (reward.type === 'FREE_ITEM') return `${reward.name} Gratis`
  if (reward.type === 'VOUCHER') return `Voucher ${formatCurrency(reward.value, currency)}`
  return reward.name
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium', className)}>
      {label}
    </span>
  )
}

function PointsBadge({ points }: { points: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-2)] font-medium">
      <Star className="w-3 h-3 text-amber-400" />
      {points.toLocaleString()} poin
    </span>
  )
}

function RewardCard({
  reward,
  balance,
  onRedeem,
  currency,
}: {
  reward: RewardCatalog
  balance: number
  onRedeem: (reward: RewardCatalog) => void
  currency: string
}) {
  const expired   = isRewardExpired(reward.expiresAt)
  const outStock  = !isStockAvailable(reward.stock)
  const canAfford = hasEnoughPoints(balance, reward.pointsCost)
  const disabled  = expired || outStock || !canAfford || !reward.active

  return (
    <div className={cn(
      'rounded-xl border bg-[var(--bg-card)] p-4 flex flex-col gap-3 transition-all',
      disabled ? 'opacity-60 border-[var(--border)]' : 'border-[var(--border)] hover:border-[var(--text-3)]',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('p-1.5 rounded-lg border', TYPE_COLOR[reward.type])}>
            {TYPE_ICON[reward.type]}
          </span>
          <div>
            <div className="font-medium text-[var(--text-1)] text-sm leading-tight">{reward.name}</div>
            <Badge label={TYPE_LABEL[reward.type]} className={TYPE_COLOR[reward.type]} />
          </div>
        </div>
        <PointsBadge points={reward.pointsCost} />
      </div>

      {reward.description && (
        <p className="text-xs text-[var(--text-3)] leading-relaxed">{reward.description}</p>
      )}

      <div className="flex items-center justify-between text-xs text-[var(--text-3)]">
        <span>
          {reward.stock === -1 ? 'Stok: Tidak terbatas' : `Stok: ${reward.stock}`}
        </span>
        {reward.expiresAt && (
          <span className={expired ? 'text-red-400' : ''}>
            Kedaluwarsa: {formatDate(reward.expiresAt)}
          </span>
        )}
      </div>

      {!reward.active && (
        <span className="text-xs text-red-400">Reward tidak aktif</span>
      )}
      {expired && reward.active && (
        <span className="text-xs text-red-400">Reward telah kedaluwarsa</span>
      )}
      {outStock && !expired && reward.active && (
        <span className="text-xs text-amber-400">Stok habis</span>
      )}
      {!canAfford && !outStock && !expired && reward.active && (
        <span className="text-xs text-[var(--text-3)]">Poin tidak cukup (butuh {reward.pointsCost - balance} lagi)</span>
      )}

      <button
        onClick={() => !disabled && onRedeem(reward)}
        disabled={disabled}
        className={cn(
          'mt-auto w-full py-2 rounded-lg text-sm font-medium transition-colors',
          disabled
            ? 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-3)] cursor-not-allowed'
            : 'bg-amber-500 hover:bg-amber-600 text-white',
        )}
      >
        Tukar Reward
      </button>
    </div>
  )
}

function RedemptionRow({ r }: { r: PointsRedemption }) {
  return (
    <tr className="border-b border-[var(--border)] hover:bg-[var(--bg-card)]/50">
      <td className="px-4 py-3 text-sm text-[var(--text-1)]">{r.rewardName ?? r.rewardId}</td>
      <td className="px-4 py-3">
        <Badge
          label={TYPE_LABEL[r.rewardType ?? 'VOUCHER']}
          className={TYPE_COLOR[r.rewardType ?? 'VOUCHER']}
        />
      </td>
      <td className="px-4 py-3">
        <PointsBadge points={r.pointsSpent} />
      </td>
      <td className="px-4 py-3">
        <Badge label={STATUS_LABEL[r.status]} className={STATUS_COLOR[r.status]} />
      </td>
      <td className="px-4 py-3 text-xs text-[var(--text-3)]">{formatDate(r.redeemedAt)}</td>
      <td className="px-4 py-3 text-xs text-[var(--text-3)]">
        {r.fulfilledAt ? formatDate(r.fulfilledAt) : '—'}
      </td>
    </tr>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RewardRedemptionClient({ storeId, currency = 'IDR' }: RewardRedemptionClientProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'catalog' | 'history' | 'manage'>('catalog')
  const [search, setSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [confirmReward, setConfirmReward] = useState<RewardCatalog | null>(null)
  const [showAddReward, setShowAddReward] = useState(false)
  const [typeFilter, setTypeFilter] = useState<RewardType | ''>('')

  // ── Data fetching ────────────────────────────────────────────────────────────

  const { data: catalog = [], isLoading: loadingCatalog, refetch: refetchCatalog } = useQuery<RewardCatalog[]>({
    queryKey: ['reward-catalog', storeId],
    queryFn: () =>
      fetch(`/api/reward-catalog?storeId=${storeId}`).then(r => r.json() as any),
  })

  const { data: redemptions = [], isLoading: loadingHistory, refetch: refetchHistory } = useQuery<PointsRedemption[]>({
    queryKey: ['points-redemptions', storeId, selectedCustomerId],
    queryFn: () => {
      const qs = selectedCustomerId
        ? `/api/points-redemptions?storeId=${storeId}&customerId=${selectedCustomerId}`
        : `/api/points-redemptions?storeId=${storeId}`
      return fetch(qs).then(r => r.json() as any)
    },
  })

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers-basic', storeId],
    queryFn: () =>
      fetch(`/api/customers?storeId=${storeId}`).then(r => r.json() as any),
  })

  const selectedCustomer = (customers as Customer[]).find(c => c.id === selectedCustomerId) ?? null
  const pointsBalance = selectedCustomer?.loyaltyPoints ?? 0

  // ── Mutations ────────────────────────────────────────────────────────────────

  const redeemMutation = useMutation({
    mutationFn: async ({ rewardId, customerId }: { rewardId: string; customerId: string }) => {
      const res = await fetch(`/api/points-redemptions?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId, customerId }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error || 'Gagal menukar reward')
      return data
    },
    onSuccess: () => {
      toast.success('Reward berhasil ditukar')
      setConfirmReward(null)
      qc.invalidateQueries({ queryKey: ['points-redemptions', storeId] })
      qc.invalidateQueries({ queryKey: ['customers-basic', storeId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const fulfillMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/points-redemptions/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error || 'Gagal update status')
      return data
    },
    onSuccess: () => {
      toast.success('Status redemption diperbarui')
      qc.invalidateQueries({ queryKey: ['points-redemptions', storeId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Add reward mutation ───────────────────────────────────────────────────────

  const [newReward, setNewReward] = useState({
    name: '', description: '', type: 'DISCOUNT' as RewardType,
    pointsCost: '', value: '', stock: '', expiresAt: '',
  })

  const addRewardMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/reward-catalog?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newReward.name,
          description: newReward.description || null,
          type: newReward.type,
          pointsCost: Number(newReward.pointsCost),
          value: Number(newReward.value),
          stock: newReward.stock !== '' ? Number(newReward.stock) : -1,
          expiresAt: newReward.expiresAt || null,
        }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error || 'Gagal menambah reward')
      return data
    },
    onSuccess: () => {
      toast.success('Reward baru ditambahkan')
      setShowAddReward(false)
      setNewReward({ name: '', description: '', type: 'DISCOUNT', pointsCost: '', value: '', stock: '', expiresAt: '' })
      qc.invalidateQueries({ queryKey: ['reward-catalog', storeId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleRewardActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`/api/reward-catalog/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error || 'Gagal update reward')
      return data
    },
    onSuccess: () => {
      toast.success('Reward diperbarui')
      qc.invalidateQueries({ queryKey: ['reward-catalog', storeId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Filtered data ────────────────────────────────────────────────────────────

  const filteredCatalog = (catalog as RewardCatalog[]).filter(r => {
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase())
    const matchType   = !typeFilter || r.type === typeFilter
    return matchSearch && matchType
  })

  const activeCatalog  = filteredCatalog.filter(r => r.active === 1)
  const inactiveCatalog = filteredCatalog.filter(r => r.active !== 1)

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30">
            <Gift className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-1)]">Reward Pelanggan</h1>
            <p className="text-sm text-[var(--text-3)]">Tukar poin loyalitas dengan reward menarik</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { refetchCatalog(); refetchHistory() }}
            className="p-2 rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {tab === 'manage' && (
            <button
              onClick={() => setShowAddReward(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Tambah Reward
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] w-fit">
        {(['catalog', 'history', 'manage'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t
                ? 'bg-amber-500 text-white'
                : 'text-[var(--text-2)] hover:text-[var(--text-1)]',
            )}
          >
            {t === 'catalog' ? 'Katalog Reward' : t === 'history' ? 'Riwayat Penukaran' : 'Kelola Reward'}
          </button>
        ))}
      </div>

      {/* ── CATALOG TAB ── */}
      {tab === 'catalog' && (
        <div className="space-y-4">
          {/* Customer selector + points balance */}
          <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">Pilih Pelanggan</label>
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm"
              >
                <option value="">-- Pilih pelanggan --</option>
                {(customers as Customer[]).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {selectedCustomer && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25">
                <Star className="w-5 h-5 text-amber-400" />
                <div>
                  <div className="text-xs text-[var(--text-3)]">Saldo Poin</div>
                  <div className="text-lg font-bold text-amber-400">{pointsBalance.toLocaleString()}</div>
                </div>
              </div>
            )}
          </div>

          {/* Search + type filter */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-3)]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari reward..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm"
              />
            </div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as RewardType | '')}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm"
            >
              <option value="">Semua Tipe</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Catalog grid */}
          {loadingCatalog ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--text-3)]" />
            </div>
          ) : activeCatalog.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-3)]">
              <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>Belum ada reward tersedia</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeCatalog.map(r => (
                <RewardCard
                  key={r.id}
                  reward={r}
                  balance={pointsBalance}
                  currency={currency}
                  onRedeem={setConfirmReward}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm"
              >
                <option value="">Semua Pelanggan</option>
                {(customers as Customer[]).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {loadingHistory ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--text-3)]" />
            </div>
          ) : (redemptions as PointsRedemption[]).length === 0 ? (
            <div className="text-center py-12 text-[var(--text-3)]">
              <History className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>Belum ada riwayat penukaran</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] overflow-hidden">
              <table className="w-full">
                <thead className="bg-[var(--bg-card)] border-b border-[var(--border)]">
                  <tr>
                    {['Reward', 'Tipe', 'Poin', 'Status', 'Ditukar', 'Dipenuhi'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--text-3)] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(redemptions as PointsRedemption[]).map(r => (
                    <RedemptionRow key={r.id} r={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── MANAGE TAB ── */}
      {tab === 'manage' && (
        <div className="space-y-4">
          {loadingCatalog ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--text-3)]" />
            </div>
          ) : (catalog as RewardCatalog[]).length === 0 ? (
            <div className="text-center py-12 text-[var(--text-3)]">
              <Gift className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>Belum ada reward. Tambah reward baru.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] overflow-hidden">
              <table className="w-full">
                <thead className="bg-[var(--bg-card)] border-b border-[var(--border)]">
                  <tr>
                    {['Nama', 'Tipe', 'Biaya Poin', 'Nilai', 'Stok', 'Status', 'Aksi'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--text-3)] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(catalog as RewardCatalog[]).map(r => (
                    <tr key={r.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-card)]/50">
                      <td className="px-4 py-3 text-sm text-[var(--text-1)] font-medium">{r.name}</td>
                      <td className="px-4 py-3">
                        <Badge label={TYPE_LABEL[r.type]} className={TYPE_COLOR[r.type]} />
                      </td>
                      <td className="px-4 py-3">
                        <PointsBadge points={r.pointsCost} />
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--text-2)]">
                        {r.value > 0 ? formatCurrency(r.value, currency) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--text-2)]">
                        {r.stock === -1 ? 'Tak terbatas' : r.stock}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          label={r.active ? 'Aktif' : 'Nonaktif'}
                          className={r.active
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-stone-500/15 text-stone-400 border-stone-500/30'}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleRewardActive.mutate({ id: r.id, active: !r.active })}
                          className="px-3 py-1 rounded-lg border border-[var(--border)] text-xs text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
                        >
                          {r.active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Confirm Redeem Modal ── */}
      {confirmReward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--text-1)]">Konfirmasi Penukaran</h2>
              <button onClick={() => setConfirmReward(null)}>
                <X className="w-5 h-5 text-[var(--text-3)]" />
              </button>
            </div>
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
              <div className="font-medium text-[var(--text-1)]">{confirmReward.name}</div>
              <div className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                <Star className="w-4 h-4 text-amber-400" />
                <span>Biaya: {confirmReward.pointsCost.toLocaleString()} poin</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                <span>Saldo setelah: {(pointsBalance - confirmReward.pointsCost).toLocaleString()} poin</span>
              </div>
            </div>
            {!selectedCustomerId && (
              <p className="text-sm text-red-400">Pilih pelanggan terlebih dahulu</p>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setConfirmReward(null)}
                className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-2)]"
              >
                Batal
              </button>
              <button
                onClick={() => redeemMutation.mutate({ rewardId: confirmReward.id, customerId: selectedCustomerId })}
                disabled={!selectedCustomerId || redeemMutation.isPending}
                className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {redeemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Tukar Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Reward Modal ── */}
      {showAddReward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--text-1)]">Tambah Reward Baru</h2>
              <button onClick={() => setShowAddReward(false)}>
                <X className="w-5 h-5 text-[var(--text-3)]" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">Nama Reward *</label>
                <input
                  value={newReward.name}
                  onChange={e => setNewReward(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm"
                  placeholder="Contoh: Diskon 10%"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">Deskripsi</label>
                <textarea
                  value={newReward.description}
                  onChange={e => setNewReward(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm resize-none"
                  placeholder="Deskripsi singkat reward..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">Tipe *</label>
                  <select
                    value={newReward.type}
                    onChange={e => setNewReward(p => ({ ...p, type: e.target.value as RewardType }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm"
                  >
                    {Object.entries(TYPE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">Biaya Poin *</label>
                  <input
                    type="number"
                    value={newReward.pointsCost}
                    onChange={e => setNewReward(p => ({ ...p, pointsCost: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm"
                    placeholder="500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">Nilai ({currency})</label>
                  <input
                    type="number"
                    value={newReward.value}
                    onChange={e => setNewReward(p => ({ ...p, value: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm"
                    placeholder="10000"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">Stok (-1 = tak terbatas)</label>
                  <input
                    type="number"
                    value={newReward.stock}
                    onChange={e => setNewReward(p => ({ ...p, stock: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm"
                    placeholder="-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-3)] mb-1 block">Kedaluwarsa (opsional)</label>
                <input
                  type="datetime-local"
                  value={newReward.expiresAt}
                  onChange={e => setNewReward(p => ({ ...p, expiresAt: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowAddReward(false)}
                className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-2)]"
              >
                Batal
              </button>
              <button
                onClick={() => addRewardMutation.mutate()}
                disabled={!newReward.name || !newReward.pointsCost || addRewardMutation.isPending}
                className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {addRewardMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Simpan Reward'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
