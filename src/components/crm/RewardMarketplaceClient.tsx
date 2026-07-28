'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Gift, Plus, Star, Tag, Package, Sparkles, Ticket, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ────────────────────────────────────────────────────────────────────

type RewardCategory = 'DISCOUNT' | 'FREE_PRODUCT' | 'EXPERIENCE' | 'VOUCHER'
type RedemptionStatus = 'PENDING' | 'FULFILLED' | 'CANCELLED'

interface RewardItem {
  id: string
  storeId: string
  name: string
  description: string
  pointsCost: number
  category: RewardCategory
  stock: number
  active: boolean
  imageUrl: string
}

interface PointsRedemption {
  id: string
  customerId: string
  storeId: string
  rewardItemId: string
  pointsSpent: number
  status: RedemptionStatus
  createdAt: string
  rewardName?: string
  rewardCategory?: string
}

interface Customer {
  id: string
  name: string
  loyaltyPoints: number
}

interface Props {
  storeId: string
  currency: string
}

// ── Pure business logic (exported for unit tests) ────────────────────────────

export function hasEnoughPoints(customerPoints: number, pointsCost: number): boolean {
  return customerPoints >= pointsCost
}

export function calcPointsAfterRedemption(currentPoints: number, pointsCost: number): number {
  if (currentPoints < pointsCost) return currentPoints
  return currentPoints - pointsCost
}

export function calcStockAfterRedemption(currentStock: number): number {
  if (currentStock <= 0) return currentStock
  return currentStock - 1
}

export function isValidRedemptionTransition(from: RedemptionStatus, to: RedemptionStatus): boolean {
  const TRANSITIONS: Record<RedemptionStatus, RedemptionStatus[]> = {
    PENDING:   ['FULFILLED', 'CANCELLED'],
    FULFILLED: [],
    CANCELLED: [],
  }
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function aggregateRedemptionHistory(redemptions: PointsRedemption[]): {
  total: number
  totalPoints: number
  pending: number
  fulfilled: number
  cancelled: number
} {
  return redemptions.reduce(
    (acc, r) => {
      acc.total++
      if (r.status === 'PENDING') acc.pending++
      else if (r.status === 'FULFILLED') acc.fulfilled++
      else if (r.status === 'CANCELLED') acc.cancelled++
      if (r.status !== 'CANCELLED') acc.totalPoints += r.pointsSpent
      return acc
    },
    { total: 0, totalPoints: 0, pending: 0, fulfilled: 0, cancelled: 0 },
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<RewardCategory, string> = {
  DISCOUNT:     'Diskon',
  FREE_PRODUCT: 'Produk Gratis',
  EXPERIENCE:   'Pengalaman',
  VOUCHER:      'Voucher',
}

const CATEGORY_ICONS: Record<RewardCategory, typeof Gift> = {
  DISCOUNT:     Tag,
  FREE_PRODUCT: Package,
  EXPERIENCE:   Sparkles,
  VOUCHER:      Ticket,
}

const STATUS_LABELS: Record<RedemptionStatus, string> = {
  PENDING:   'Menunggu',
  FULFILLED: 'Selesai',
  CANCELLED: 'Dibatalkan',
}

const STATUS_COLORS: Record<RedemptionStatus, string> = {
  PENDING:   'text-yellow-600 bg-yellow-50',
  FULFILLED: 'text-green-600 bg-green-50',
  CANCELLED: 'text-red-500 bg-red-50',
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function RewardMarketplaceClient({ storeId, currency }: Props) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'catalog' | 'history' | 'manage'>('catalog')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)

  // Fetch reward items
  const { data: rewards = [], isLoading: loadingRewards } = useQuery<RewardItem[]>({
    queryKey: ['reward-items', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/reward-items?storeId=${storeId}`)
      return await res.json() as any
    },
  })

  // Fetch customers
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers-loyalty', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/customers?storeId=${storeId}`)
      const data = await res.json() as any
      return Array.isArray(data) ? data : data.customers ?? []
    },
  })

  // Fetch redemption history (for selected customer if any)
  const { data: redemptions = [], isLoading: loadingHistory } = useQuery<PointsRedemption[]>({
    queryKey: ['points-redemptions', storeId, selectedCustomerId],
    queryFn: async () => {
      const url = selectedCustomerId
        ? `/api/points-redemptions?storeId=${storeId}&customerId=${selectedCustomerId}`
        : `/api/points-redemptions?storeId=${storeId}`
      const res = await fetch(url)
      return await res.json() as any
    },
  })

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null
  const historyStats = aggregateRedemptionHistory(redemptions)

  const handleRedeem = async (reward: RewardItem) => {
    if (!selectedCustomerId) {
      toast.error('Pilih pelanggan terlebih dahulu')
      return
    }
    if (!selectedCustomer) return
    if (!hasEnoughPoints(selectedCustomer.loyaltyPoints, reward.pointsCost)) {
      toast.error(`Poin tidak cukup. Dibutuhkan: ${reward.pointsCost}, Tersedia: ${selectedCustomer.loyaltyPoints}`)
      return
    }
    const res = await fetch(`/api/points-redemptions?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: selectedCustomerId, rewardItemId: reward.id }),
    })
    const data = await res.json() as { error?: string; id?: string; pointsSpent?: number }
    if (data.error) { toast.error(data.error); return }
    toast.success(`Berhasil ditukar! ${data.pointsSpent} poin digunakan`)
    qc.invalidateQueries({ queryKey: ['reward-items', storeId] })
    qc.invalidateQueries({ queryKey: ['points-redemptions', storeId] })
    qc.invalidateQueries({ queryKey: ['customers-loyalty', storeId] })
  }

  const handleStatusChange = async (redemptionId: string, newStatus: RedemptionStatus) => {
    const res = await fetch(`/api/points-redemptions/${redemptionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    const data = await res.json() as { error?: string }
    if (data.error) { toast.error(data.error); return }
    toast.success(`Status diperbarui: ${STATUS_LABELS[newStatus]}`)
    qc.invalidateQueries({ queryKey: ['points-redemptions', storeId] })
    qc.invalidateQueries({ queryKey: ['customers-loyalty', storeId] })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Reward Marketplace</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">Tukar poin pelanggan dengan hadiah menarik</p>
        </div>
        {activeTab === 'manage' && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Tambah Reward
          </button>
        )}
      </div>

      {/* Customer selector */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <label className="block text-sm font-medium text-[var(--text-2)] mb-2">Pilih Pelanggan</label>
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
          >
            <option value="">— Semua pelanggan —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.loyaltyPoints ?? 0} poin)
              </option>
            ))}
          </select>
          {selectedCustomer && (
            <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-2">
              <Star className="h-4 w-4 text-yellow-500 fill-yellow-400" />
              <span className="text-sm font-semibold text-yellow-700">
                {selectedCustomer.loyaltyPoints ?? 0} poin tersedia
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1 w-fit">
        {(['catalog', 'history', 'manage'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-2)] hover:text-[var(--text-1)]',
            )}
          >
            {tab === 'catalog' ? 'Katalog' : tab === 'history' ? 'Riwayat' : 'Kelola'}
          </button>
        ))}
      </div>

      {/* ── Catalog tab ── */}
      {activeTab === 'catalog' && (
        <div>
          {loadingRewards ? (
            <div className="py-20 text-center text-[var(--text-3)]">Memuat katalog…</div>
          ) : rewards.filter((r) => r.active).length === 0 ? (
            <div className="py-20 text-center text-[var(--text-3)]">
              <Gift className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p>Belum ada reward aktif</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rewards
                .filter((r) => r.active)
                .map((reward) => {
                  const Icon = CATEGORY_ICONS[reward.category] ?? Gift
                  const canAfford = selectedCustomer
                    ? hasEnoughPoints(selectedCustomer.loyaltyPoints, reward.pointsCost)
                    : true
                  const outOfStock = reward.stock <= 0
                  return (
                    <div
                      key={reward.id}
                      className={cn(
                        'rounded-xl border bg-[var(--bg-card)] p-4 flex flex-col gap-3 transition-opacity',
                        (outOfStock || (!canAfford && selectedCustomer)) && 'opacity-60',
                        'border-[var(--border)]',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="rounded-lg bg-[var(--bg-2)] p-2">
                            <Icon className="h-5 w-5 text-[var(--primary)]" />
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--text-1)] leading-tight">{reward.name}</p>
                            <span className="text-xs text-[var(--text-3)]">
                              {CATEGORY_LABELS[reward.category]}
                            </span>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-semibold text-yellow-700 border border-yellow-200">
                          {reward.pointsCost} poin
                        </span>
                      </div>
                      {reward.description && (
                        <p className="text-sm text-[var(--text-2)]">{reward.description}</p>
                      )}
                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-xs text-[var(--text-3)]">
                          Stok: {reward.stock}
                        </span>
                        <button
                          disabled={outOfStock || (!canAfford && !!selectedCustomer) || !selectedCustomerId}
                          onClick={() => handleRedeem(reward)}
                          className={cn(
                            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                            outOfStock
                              ? 'bg-[var(--bg-2)] text-[var(--text-3)] cursor-not-allowed'
                              : !canAfford && selectedCustomer
                              ? 'bg-red-50 text-red-400 cursor-not-allowed'
                              : !selectedCustomerId
                              ? 'bg-[var(--bg-2)] text-[var(--text-3)] cursor-not-allowed'
                              : 'bg-[var(--primary)] text-white hover:opacity-90',
                          )}
                        >
                          {outOfStock
                            ? 'Habis'
                            : !canAfford && selectedCustomer
                            ? 'Poin Kurang'
                            : 'Tukar'}
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* ── History tab ── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Summary stats */}
          {redemptions.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Total Tukar', value: historyStats.total, color: 'text-[var(--text-1)]' },
                { label: 'Total Poin', value: `${historyStats.totalPoints}`, color: 'text-yellow-600' },
                { label: 'Selesai', value: historyStats.fulfilled, color: 'text-green-600' },
                { label: 'Dibatalkan', value: historyStats.cancelled, color: 'text-red-500' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-center">
                  <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
                  <p className="text-xs text-[var(--text-3)] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {loadingHistory ? (
            <div className="py-20 text-center text-[var(--text-3)]">Memuat riwayat…</div>
          ) : redemptions.length === 0 ? (
            <div className="py-20 text-center text-[var(--text-3)]">
              <Clock className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p>Belum ada riwayat penukaran</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)]">
              {redemptions.map((r) => (
                <div key={r.id} className="p-4">
                  <div
                    className="flex items-center justify-between gap-4 cursor-pointer"
                    onClick={() => setExpandedHistory(expandedHistory === r.id ? null : r.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Gift className="h-4 w-4 shrink-0 text-[var(--text-3)]" />
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--text-1)] truncate">{r.rewardName ?? r.rewardItemId}</p>
                        <p className="text-xs text-[var(--text-3)]">
                          {new Date(r.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-semibold text-yellow-600">{r.pointsSpent} poin</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[r.status])}>
                        {STATUS_LABELS[r.status]}
                      </span>
                      {expandedHistory === r.id ? (
                        <ChevronUp className="h-4 w-4 text-[var(--text-3)]" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-[var(--text-3)]" />
                      )}
                    </div>
                  </div>
                  {expandedHistory === r.id && r.status === 'PENDING' && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleStatusChange(r.id, 'FULFILLED')}
                        className="flex items-center gap-1.5 rounded-lg bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Tandai Selesai
                      </button>
                      <button
                        onClick={() => handleStatusChange(r.id, 'CANCELLED')}
                        className="flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Batalkan
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Manage tab ── */}
      {activeTab === 'manage' && (
        <div className="space-y-4">
          {showAddForm && (
            <AddRewardForm
              storeId={storeId}
              onClose={() => setShowAddForm(false)}
              onSaved={() => {
                setShowAddForm(false)
                qc.invalidateQueries({ queryKey: ['reward-items', storeId] })
              }}
            />
          )}
          {rewards.length === 0 ? (
            <div className="py-20 text-center text-[var(--text-3)]">
              <Gift className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p>Belum ada reward. Klik Tambah Reward untuk memulai.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)]">
              {rewards.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rounded-lg bg-[var(--bg-2)] p-2">
                      {(() => { const Icon = CATEGORY_ICONS[r.category] ?? Gift; return <Icon className="h-4 w-4 text-[var(--primary)]" /> })()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text-1)] truncate">{r.name}</p>
                      <p className="text-xs text-[var(--text-3)]">
                        {CATEGORY_LABELS[r.category]} · {r.pointsCost} poin · Stok: {r.stock}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const res = await fetch(`/api/reward-items/${r.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ active: !r.active }),
                      })
                      const data = await res.json() as { error?: string }
                      if (data.error) { toast.error(data.error); return }
                      toast.success(r.active ? 'Reward dinonaktifkan' : 'Reward diaktifkan')
                      qc.invalidateQueries({ queryKey: ['reward-items', storeId] })
                    }}
                    className={cn(
                      'shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                      r.active
                        ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                        : 'bg-[var(--bg-2)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--bg-card)]',
                    )}
                  >
                    {r.active ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add Reward Form ───────────────────────────────────────────────────────────

function AddRewardForm({
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
    description: '',
    pointsCost: '',
    category: 'DISCOUNT' as RewardCategory,
    stock: '',
    imageUrl: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.pointsCost) { toast.error('Nama dan biaya poin wajib diisi'); return }
    setSaving(true)
    const res = await fetch(`/api/reward-items?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        pointsCost: Number(form.pointsCost),
        stock: Number(form.stock) || 0,
      }),
    })
    const data = await res.json() as { error?: string }
    setSaving(false)
    if (data.error) { toast.error(data.error); return }
    toast.success('Reward berhasil ditambahkan')
    onSaved()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4"
    >
      <h3 className="font-semibold text-[var(--text-1)]">Tambah Reward Baru</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Nama Reward *</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
            placeholder="Diskon 10%"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Kategori</label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as RewardCategory })}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
          >
            <option value="DISCOUNT">Diskon</option>
            <option value="FREE_PRODUCT">Produk Gratis</option>
            <option value="EXPERIENCE">Pengalaman</option>
            <option value="VOUCHER">Voucher</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Biaya Poin *</label>
          <input
            type="number"
            min="0"
            value={form.pointsCost}
            onChange={(e) => setForm({ ...form, pointsCost: e.target.value })}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
            placeholder="500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Stok Awal</label>
          <input
            type="number"
            min="0"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
            placeholder="10"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Deskripsi</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
            placeholder="Deskripsi singkat reward…"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)]"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </form>
  )
}
