'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, Trophy, Zap, Gift, Plus, Edit2, ChevronUp } from 'lucide-react'

interface LoyaltyTier {
  id: string
  storeId: string
  name: string
  minPoints: number
  maxPoints: number | null
  discountPct: number
  bonusMultiplier: number
  badgeColor: string
  active: boolean
}

interface LoyaltyChallenge {
  id: string
  storeId: string
  name: string
  description: string
  targetType: 'PURCHASE_COUNT' | 'SPEND_AMOUNT' | 'VISIT_STREAK'
  targetValue: number
  rewardPoints: number
  startAt: string
  endAt: string
  active: boolean
}

interface Props {
  storeId: string
  currency?: string
}

export default function LoyaltyTierClient({ storeId, currency = 'IDR' }: Props) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'tiers' | 'challenges'>('tiers')
  const [showTierForm, setShowTierForm] = useState(false)
  const [showChallengeForm, setShowChallengeForm] = useState(false)
  const [editingTier, setEditingTier] = useState<LoyaltyTier | null>(null)

  // ── Queries ─────────────────────────────────────────────────────────────
  const { data: tiers = [], isLoading: tiersLoading } = useQuery<LoyaltyTier[]>({
    queryKey: ['loyalty-tiers', storeId],
    queryFn: () => fetch(`/api/loyalty-tiers?storeId=${storeId}`).then(r => r.json()).then((d: any) => d.tiers ?? []),
    staleTime: 30_000,
  })

  const { data: challenges = [], isLoading: challengesLoading } = useQuery<LoyaltyChallenge[]>({
    queryKey: ['loyalty-challenges', storeId],
    queryFn: () => fetch(`/api/loyalty-challenges?storeId=${storeId}`).then(r => r.json()).then((d: any) => d.challenges ?? []),
    staleTime: 30_000,
  })

  // ── Tier Form ────────────────────────────────────────────────────────────
  function TierForm({ initial, onClose }: { initial?: LoyaltyTier | null, onClose: () => void }) {
    const [name, setName] = useState(initial?.name ?? '')
    const [minPoints, setMinPoints] = useState(String(initial?.minPoints ?? 0))
    const [maxPoints, setMaxPoints] = useState(String(initial?.maxPoints ?? ''))
    const [discountPct, setDiscountPct] = useState(String(initial?.discountPct ?? 0))
    const [bonusMultiplier, setBonusMultiplier] = useState(String(initial?.bonusMultiplier ?? 1))
    const [badgeColor, setBadgeColor] = useState(initial?.badgeColor ?? '#6366f1')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    async function save() {
      if (!name.trim()) { setError('Nama tier wajib diisi'); return }
      setSaving(true)
      try {
        const url = initial?.id ? `/api/loyalty-tiers/${initial.id}` : '/api/loyalty-tiers'
        const method = initial?.id ? 'PATCH' : 'POST'
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId, name: name.trim(),
            minPoints: Number(minPoints),
            maxPoints: maxPoints ? Number(maxPoints) : null,
            discountPct: Number(discountPct),
            bonusMultiplier: Number(bonusMultiplier),
            badgeColor,
          }),
        })
        const d = await res.json() as { error?: string }
        if (!res.ok) throw new Error(d.error ?? 'Gagal menyimpan')
        qc.invalidateQueries({ queryKey: ['loyalty-tiers', storeId] })
        onClose()
      } catch (e: any) {
        setError(e.message)
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] p-6 shadow-xl">
          <h3 className="mb-4 text-base font-semibold text-[var(--text-1)]">
            {initial?.id ? 'Edit Tier' : 'Tambah Tier'}
          </h3>
          {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Nama Tier</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]"
                placeholder="Bronze, Silver, Gold..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Min Poin</label>
                <input type="number" value={minPoints} onChange={e => setMinPoints(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Max Poin (kosong = tak terbatas)</label>
                <input type="number" value={maxPoints} onChange={e => setMaxPoints(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]"
                  placeholder="∞" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Diskon (%)</label>
                <input type="number" value={discountPct} onChange={e => setDiscountPct(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Bonus Multiplier</label>
                <input type="number" step="0.1" value={bonusMultiplier} onChange={e => setBonusMultiplier(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Warna Badge</label>
              <div className="flex items-center gap-3">
                <input type="color" value={badgeColor} onChange={e => setBadgeColor(e.target.value)}
                  className="h-9 w-16 rounded border border-[var(--border)] bg-[var(--bg-input)] p-1" />
                <span className="text-sm text-[var(--text-2)]">{badgeColor}</span>
              </div>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)]">
              Batal
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Challenge Form ───────────────────────────────────────────────────────
  function ChallengeForm({ onClose }: { onClose: () => void }) {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [targetType, setTargetType] = useState<'PURCHASE_COUNT' | 'SPEND_AMOUNT' | 'VISIT_STREAK'>('PURCHASE_COUNT')
    const [targetValue, setTargetValue] = useState('10')
    const [rewardPoints, setRewardPoints] = useState('100')
    const [startAt, setStartAt] = useState(new Date().toISOString().slice(0, 10))
    const [endAt, setEndAt] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    async function save() {
      if (!name.trim()) { setError('Nama challenge wajib diisi'); return }
      setSaving(true)
      try {
        const res = await fetch('/api/loyalty-challenges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId, name: name.trim(), description,
            targetType, targetValue: Number(targetValue),
            rewardPoints: Number(rewardPoints),
            startAt: new Date(startAt).toISOString(),
            endAt: new Date(endAt).toISOString(),
          }),
        })
        const d = await res.json() as { error?: string }
        if (!res.ok) throw new Error(d.error ?? 'Gagal menyimpan')
        qc.invalidateQueries({ queryKey: ['loyalty-challenges', storeId] })
        onClose()
      } catch (e: any) {
        setError(e.message)
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] p-6 shadow-xl">
          <h3 className="mb-4 text-base font-semibold text-[var(--text-1)]">Tambah Challenge</h3>
          {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Nama Challenge</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Deskripsi</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Tipe Target</label>
              <select value={targetType} onChange={e => setTargetType(e.target.value as any)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]">
                <option value="PURCHASE_COUNT">Jumlah Pembelian</option>
                <option value="SPEND_AMOUNT">Total Belanja</option>
                <option value="VISIT_STREAK">Streak Kunjungan</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Nilai Target</label>
                <input type="number" value={targetValue} onChange={e => setTargetValue(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Poin Hadiah</label>
                <input type="number" value={rewardPoints} onChange={e => setRewardPoints(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Mulai</label>
                <input type="date" value={startAt} onChange={e => setStartAt(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Selesai</label>
                <input type="date" value={endAt} onChange={e => setEndAt(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
              </div>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-subtle)]">
              Batal
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)]">Program Loyalitas</h1>
          <p className="text-sm text-[var(--text-3)]">Kelola tier, badge, dan challenge untuk pelanggan</p>
        </div>
        <button
          onClick={() => activeTab === 'tiers' ? setShowTierForm(true) : setShowChallengeForm(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
        >
          <Plus className="h-4 w-4" />
          {activeTab === 'tiers' ? 'Tambah Tier' : 'Tambah Challenge'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1 w-fit">
        {(['tiers', 'challenges'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${activeTab === tab ? 'bg-[var(--bg-card)] text-[var(--text-1)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}>
            {tab === 'tiers' ? '🏅 Tier' : '⚡ Challenge'}
          </button>
        ))}
      </div>

      {/* Tiers Tab */}
      {activeTab === 'tiers' && (
        <div>
          {tiersLoading ? (
            <div className="py-12 text-center text-sm text-[var(--text-3)]">Memuat...</div>
          ) : tiers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center">
              <Trophy className="mx-auto mb-3 h-10 w-10 text-[var(--text-3)]" />
              <p className="text-sm text-[var(--text-3)]">Belum ada tier. Tambahkan tier pertama.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {tiers.map(tier => (
                <div key={tier.id} className={`rounded-2xl border bg-[var(--bg-card)] p-5 shadow-sm transition-all ${tier.active ? 'border-[var(--border)]' : 'opacity-50 border-dashed border-[var(--border)]'}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: tier.badgeColor }}>
                      <Star className="h-3 w-3" /> {tier.name}
                    </span>
                    <button onClick={() => { setEditingTier(tier); setShowTierForm(true) }}
                      className="rounded-lg p-1 text-[var(--text-3)] hover:bg-[var(--bg-subtle)]">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs text-[var(--text-2)]">
                    <div className="flex justify-between">
                      <span>Min Poin</span>
                      <span className="font-medium text-[var(--text-1)]">{tier.minPoints.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max Poin</span>
                      <span className="font-medium text-[var(--text-1)]">{tier.maxPoints ? tier.maxPoints.toLocaleString() : '∞'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Diskon</span>
                      <span className="font-medium text-green-500">{tier.discountPct}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Bonus Poin</span>
                      <span className="font-medium text-indigo-500">{tier.bonusMultiplier}×</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Challenges Tab */}
      {activeTab === 'challenges' && (
        <div>
          {challengesLoading ? (
            <div className="py-12 text-center text-sm text-[var(--text-3)]">Memuat...</div>
          ) : challenges.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center">
              <Zap className="mx-auto mb-3 h-10 w-10 text-[var(--text-3)]" />
              <p className="text-sm text-[var(--text-3)]">Belum ada challenge.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {challenges.map(ch => (
                <div key={ch.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-subtle)]">
                      {ch.targetType === 'PURCHASE_COUNT' ? <Gift className="h-4 w-4 text-indigo-500" /> :
                       ch.targetType === 'SPEND_AMOUNT' ? <Star className="h-4 w-4 text-yellow-500" /> :
                       <ChevronUp className="h-4 w-4 text-green-500" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-1)]">{ch.name}</p>
                      <p className="text-xs text-[var(--text-3)]">{ch.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-indigo-500">+{ch.rewardPoints} poin</p>
                    <p className="text-xs text-[var(--text-3)]">Target: {ch.targetValue}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showTierForm && <TierForm initial={editingTier} onClose={() => { setShowTierForm(false); setEditingTier(null) }} />}
      {showChallengeForm && <ChallengeForm onClose={() => setShowChallengeForm(false)} />}
    </div>
  )
}
