'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Gift, Tag, Package, Coins, AlertCircle, Check, Loader2, Plus, X, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type RewardType = 'DISCOUNT_VOUCHER' | 'FREE_PRODUCT' | 'CASHBACK'

interface RewardItem {
  id: string
  storeId: string
  name: string
  description: string | null
  pointsCost: number
  type: RewardType
  value: number
  stock: number // -1 = unlimited
  active: number
  createdAt: string
}

interface RedeemResult {
  voucherCode: string
  rewardName: string
  rewardType: RewardType
  rewardValue: number
  pointsDeducted: number
}

interface RewardsMarketplaceClientProps {
  storeId: string
  currency: string
  userRole?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

const REWARD_TYPE_META: Record<RewardType, { label: string; icon: React.ReactNode; color: string }> = {
  DISCOUNT_VOUCHER: {
    label: 'Voucher Diskon',
    icon: <Tag size={14} />,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  },
  FREE_PRODUCT: {
    label: 'Produk Gratis',
    icon: <Package size={14} />,
    color: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  },
  CASHBACK: {
    label: 'Cashback',
    icon: <Coins size={14} />,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
}

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-[var(--text-1)] text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

// ─── Main Component ───────────────────────────────────────────────────────────

export function RewardsMarketplaceClient({
  storeId,
  currency,
  userRole,
}: RewardsMarketplaceClientProps) {
  const qc = useQueryClient()
  const [showNewReward, setShowNewReward] = useState(false)
  const [redeemModal, setRedeemModal] = useState<RewardItem | null>(null)
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null)
  const canManage = userRole === 'OWNER' || userRole === 'MANAGER'

  const { data, isLoading, isError } = useQuery<RewardItem[]>({
    queryKey: ['rewards', storeId],
    queryFn: () => fetch(`/api/rewards?storeId=${storeId}`).then(r => r.json()),
  })

  const rewards: RewardItem[] = data ?? []

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)] flex items-center gap-2">
            <Gift size={22} className="text-amber-500" />
            Rewards Marketplace
          </h1>
          <p className="text-[var(--text-2)] mt-1 text-sm">
            Katalog hadiah yang bisa ditukar dengan poin
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowNewReward(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Tambah Reward
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(REWARD_TYPE_META) as [RewardType, typeof REWARD_TYPE_META[RewardType]][]).map(
          ([type, meta]) => (
            <span
              key={type}
              className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border font-medium', meta.color)}
            >
              {meta.icon}
              {meta.label}
            </span>
          ),
        )}
      </div>

      {/* Content */}
      {isLoading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-44 bg-[var(--bg-muted)] rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-red-400 text-sm py-8 justify-center">
          <AlertCircle size={16} />
          Gagal memuat rewards. Coba lagi.
        </div>
      )}

      {!isLoading && !isError && rewards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--text-3)]">
          <Gift size={48} strokeWidth={1} className="mb-4" />
          <p className="text-base font-medium text-[var(--text-2)]">Belum ada rewards</p>
          <p className="text-sm mt-1">
            {canManage ? 'Tambahkan reward pertama untuk program loyalitas Anda.' : 'Belum ada reward tersedia saat ini.'}
          </p>
        </div>
      )}

      {!isLoading && rewards.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewards.map(reward => (
            <RewardCard
              key={reward.id}
              reward={reward}
              currency={currency}
              onRedeem={() => setRedeemModal(reward)}
            />
          ))}
        </div>
      )}

      {/* New Reward Modal */}
      {showNewReward && (
        <NewRewardModal
          storeId={storeId}
          onClose={() => setShowNewReward(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['rewards', storeId] })
            setShowNewReward(false)
          }}
        />
      )}

      {/* Redeem Modal */}
      {redeemModal && !redeemResult && (
        <RedeemModal
          storeId={storeId}
          reward={redeemModal}
          currency={currency}
          onClose={() => setRedeemModal(null)}
          onSuccess={result => {
            setRedeemResult(result)
            qc.invalidateQueries({ queryKey: ['rewards', storeId] })
          }}
        />
      )}

      {/* Redemption Success Modal */}
      {redeemResult && (
        <RedeemSuccessModal
          result={redeemResult}
          currency={currency}
          onClose={() => {
            setRedeemResult(null)
            setRedeemModal(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Reward Card ──────────────────────────────────────────────────────────────

function RewardCard({
  reward,
  currency,
  onRedeem,
}: {
  reward: RewardItem
  currency: string
  onRedeem: () => void
}) {
  const meta = REWARD_TYPE_META[reward.type as RewardType]
  const outOfStock = reward.stock !== -1 && reward.stock <= 0

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex flex-col gap-4">
      {/* Type badge + stock */}
      <div className="flex items-start justify-between">
        <span
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border font-medium',
            meta.color,
          )}
        >
          {meta.icon}
          {meta.label}
        </span>
        {reward.stock !== -1 && (
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              outOfStock ? 'bg-red-500/10 text-red-400' : 'bg-[var(--bg-muted)] text-[var(--text-3)]',
            )}
          >
            {outOfStock ? 'Habis' : `Stok: ${reward.stock}`}
          </span>
        )}
      </div>

      {/* Name + description */}
      <div>
        <p className="font-semibold text-[var(--text-1)]">{reward.name}</p>
        {reward.description && (
          <p className="text-xs text-[var(--text-3)] mt-1 line-clamp-2">{reward.description}</p>
        )}
      </div>

      {/* Value */}
      <div className="text-sm text-[var(--text-2)]">
        Nilai:{' '}
        <span className="font-semibold text-[var(--text-1)]">
          {reward.type === 'DISCOUNT_VOUCHER' || reward.type === 'CASHBACK'
            ? formatCurrency(reward.value, currency)
            : `${reward.value} unit`}
        </span>
      </div>

      {/* Points cost + redeem button */}
      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-1.5">
          <Star size={14} className="fill-amber-400 text-amber-400" />
          <span className="text-sm font-bold text-amber-500">
            {reward.pointsCost.toLocaleString('id-ID')} poin
          </span>
        </div>
        <button
          onClick={onRedeem}
          disabled={outOfStock}
          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Tukar
        </button>
      </div>
    </div>
  )
}

// ─── Redeem Modal ─────────────────────────────────────────────────────────────

function RedeemModal({
  storeId,
  reward,
  currency,
  onClose,
  onSuccess,
}: {
  storeId: string
  reward: RewardItem
  currency: string
  onClose: () => void
  onSuccess: (result: RedeemResult) => void
}) {
  const [customerId, setCustomerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const meta = REWARD_TYPE_META[reward.type as RewardType]

  const handleRedeem = async () => {
    if (!customerId.trim()) {
      setError('Customer ID diperlukan')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/rewards/${reward.id}/redeem?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: customerId.trim() }),
      })
      const data = (await res.json()) as any
      if (!res.ok) {
        setError(data.error || 'Penukaran gagal')
        return
      }
      onSuccess(data as RedeemResult)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl w-full max-w-sm border border-[var(--border)] shadow-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--text-1)] flex items-center gap-2">
            <Gift size={16} className="text-amber-500" />
            Tukar Reward
          </h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Reward summary */}
        <div className="rounded-xl bg-[var(--bg-muted)] p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border', meta.color)}>
              {meta.icon} {meta.label}
            </span>
          </div>
          <p className="font-semibold text-[var(--text-1)]">{reward.name}</p>
          <div className="flex items-center gap-1.5 text-sm">
            <Star size={12} className="fill-amber-400 text-amber-400" />
            <span className="font-bold text-amber-500">
              {reward.pointsCost.toLocaleString('id-ID')} poin
            </span>
            <span className="text-[var(--text-3)]">·</span>
            <span className="text-[var(--text-2)]">
              Nilai:{' '}
              {reward.type !== 'FREE_PRODUCT'
                ? formatCurrency(reward.value, currency)
                : `${reward.value} unit`}
            </span>
          </div>
        </div>

        {/* Customer ID input */}
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
            Customer ID *
          </label>
          <input
            value={customerId}
            onChange={e => setCustomerId(e.target.value)}
            placeholder="Masukkan ID pelanggan"
            className={inputCls}
          />
        </div>

        {error && (
          <p className="text-sm text-red-400 flex items-center gap-1.5">
            <AlertCircle size={14} /> {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleRedeem}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Memproses...' : 'Tukar Sekarang'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Redemption Success Modal ─────────────────────────────────────────────────

function RedeemSuccessModal({
  result,
  currency,
  onClose,
}: {
  result: RedeemResult
  currency: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copyCode = () => {
    navigator.clipboard.writeText(result.voucherCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl w-full max-w-sm border border-[var(--border)] shadow-xl p-6 space-y-5 text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10 mx-auto">
          <Check size={28} className="text-emerald-400" />
        </div>

        <div>
          <p className="text-lg font-bold text-[var(--text-1)]">Penukaran Berhasil!</p>
          <p className="text-sm text-[var(--text-2)] mt-1">{result.rewardName}</p>
        </div>

        {/* Voucher code */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
          <p className="text-xs text-[var(--text-3)] uppercase tracking-wider">Kode Voucher</p>
          <p className="font-mono text-xl font-bold text-amber-400 tracking-widest">
            {result.voucherCode}
          </p>
          <button
            onClick={copyCode}
            className="text-xs text-amber-500 hover:text-amber-400 transition-colors"
          >
            {copied ? '✓ Disalin!' : 'Salin kode'}
          </button>
        </div>

        <div className="text-sm text-[var(--text-2)] space-y-1">
          <div className="flex justify-between">
            <span>Nilai reward</span>
            <span className="font-medium text-[var(--text-1)]">
              {result.rewardType !== 'FREE_PRODUCT'
                ? formatCurrency(result.rewardValue, currency)
                : `${result.rewardValue} unit`}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Poin dikurangi</span>
            <span className="font-medium text-red-400">
              -{result.pointsDeducted.toLocaleString('id-ID')} poin
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-[var(--bg-muted)] text-sm text-[var(--text-1)] hover:bg-[var(--bg-subtle)] transition-colors"
        >
          Selesai
        </button>
      </div>
    </div>
  )
}

// ─── New Reward Modal ─────────────────────────────────────────────────────────

function NewRewardModal({
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
    description: '',
    pointsCost: '',
    type: 'DISCOUNT_VOUCHER' as RewardType,
    value: '',
    stock: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) { setError('Nama reward diperlukan'); return }
    if (!form.pointsCost || Number(form.pointsCost) <= 0) { setError('Points cost harus > 0'); return }
    if (!form.value || Number(form.value) <= 0) { setError('Nilai harus > 0'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/rewards?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          pointsCost: Number(form.pointsCost),
          type: form.type,
          value: Number(form.value),
          stock: form.stock ? Number(form.stock) : -1,
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as any
        setError(d.error || 'Gagal membuat reward')
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
      <div className="bg-[var(--bg-card)] rounded-xl w-full max-w-md border border-[var(--border)] shadow-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--text-1)] flex items-center gap-2">
            <Gift size={16} className="text-amber-500" />
            Tambah Reward
          </h2>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
              Nama Reward *
            </label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Voucher Diskon 10%"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
              Deskripsi
            </label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Deskripsi singkat (opsional)"
              rows={2}
              className={cn(inputCls, 'resize-none')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
              Tipe Reward *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(REWARD_TYPE_META) as [RewardType, typeof REWARD_TYPE_META[RewardType]][]).map(
                ([type, meta]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => set('type', type)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all',
                      form.type === type
                        ? 'border-amber-500/60 bg-amber-500/10 text-amber-600'
                        : 'border-[var(--border)] bg-[var(--bg-muted)] text-[var(--text-2)] hover:border-stone-400',
                    )}
                  >
                    {meta.icon}
                    {meta.label}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                Biaya Poin *
              </label>
              <input
                type="number"
                min={1}
                value={form.pointsCost}
                onChange={e => set('pointsCost', e.target.value)}
                placeholder="500"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                {form.type === 'FREE_PRODUCT' ? 'Jumlah Unit' : 'Nilai (Rp)'}
              </label>
              <input
                type="number"
                min={0}
                value={form.value}
                onChange={e => set('value', e.target.value)}
                placeholder={form.type === 'FREE_PRODUCT' ? '1' : '10000'}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
              Stok (kosongkan = tidak terbatas)
            </label>
            <input
              type="number"
              min={0}
              value={form.stock}
              onChange={e => set('stock', e.target.value)}
              placeholder="Tidak terbatas"
              className={inputCls}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400 flex items-center gap-1.5">
            <AlertCircle size={14} /> {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Menyimpan...' : 'Simpan Reward'}
          </button>
        </div>
      </div>
    </div>
  )
}
