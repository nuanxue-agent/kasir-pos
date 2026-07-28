'use client'

import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Plus, Users, TrendingUp, Gift, RefreshCw, Check, X,
  Loader2, Copy, Share2, ToggleLeft, ToggleRight, Award,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcConversionRate,
  calcTotalRewardsIssued,
  formatRewardLabel,
  type RewardType,
  type ReferralStatus,
} from '@/lib/referrals'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ReferralProgram {
  id: string
  storeId: string
  name: string
  rewardType: RewardType
  rewardAmount: number
  active: boolean
  createdAt: string
}

interface CustomerReferral {
  id: string
  programId: string
  referrerId: string
  refereeId: string | null
  referrerName: string
  refereeName: string | null
  referralCode: string
  storeId: string
  status: ReferralStatus
  createdAt: string
}

interface ReferralClientProps {
  storeId: string
  currency?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REWARD_TYPES: { value: RewardType; label: string }[] = [
  { value: 'DISCOUNT', label: 'Diskon (%)' },
  { value: 'POINTS', label: 'Poin' },
  { value: 'CASH', label: 'Tunai (Rp)' },
]

const STATUS_CONFIG: Record<ReferralStatus, { label: string; color: string }> = {
  PENDING:   { label: 'Menunggu',  color: 'bg-amber-50 text-amber-600 border-amber-200' },
  QUALIFIED: { label: 'Qualified', color: 'bg-blue-50 text-blue-600 border-blue-200' },
  REWARDED:  { label: 'Diberikan', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color: string
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className={cn('rounded-lg p-2', color)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-[var(--text-1)]">{value}</p>
      <p className="text-sm font-medium text-[var(--text-2)]">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--text-3)]">{sub}</p>}
    </div>
  )
}

// ─── New Program Modal ────────────────────────────────────────────────────────

function ProgramModal({
  storeId,
  onClose,
  onSuccess,
}: {
  storeId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [rewardType, setRewardType] = useState<RewardType>('POINTS')
  const [rewardAmount, setRewardAmount] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !rewardAmount) return
    setSaving(true)
    try {
      const res = await fetch('/api/referral-programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          name: name.trim(),
          rewardType,
          rewardAmount: Number(rewardAmount),
        }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error || 'Gagal membuat program')
      toast.success('Program referral dibuat')
      onSuccess()
      onClose()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-1)]">Program Referral Baru</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--bg-muted)]">
            <X className="h-5 w-5 text-[var(--text-3)]" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Nama Program</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Program Referral Musim Panas"
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Tipe Hadiah</label>
            <select
              value={rewardType}
              onChange={(e) => setRewardType(e.target.value as RewardType)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              {REWARD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">
              Jumlah Hadiah {rewardType === 'DISCOUNT' ? '(%)' : rewardType === 'POINTS' ? '(poin)' : '(Rp)'}
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={rewardAmount}
              onChange={(e) => setRewardAmount(e.target.value)}
              placeholder="0"
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-muted)]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Track Referral Modal ─────────────────────────────────────────────────────

function TrackModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const [referralCode, setReferralCode] = useState('')
  const [refereePhone, setRefereePhone] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!referralCode.trim() || !refereePhone.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/referrals/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referralCode: referralCode.trim().toUpperCase(),
          refereePhone: refereePhone.trim(),
        }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error || 'Gagal melacak referral')
      toast.success('Referral berhasil dilacak')
      onSuccess()
      onClose()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-1)]">Lacak Referral</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--bg-muted)]">
            <X className="h-5 w-5 text-[var(--text-3)]" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Kode Referral</label>
            <input
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              placeholder="Contoh: ABC12345"
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm font-mono text-[var(--text-1)] placeholder:text-[var(--text-3)] uppercase focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">No. HP Pelanggan Baru (Referee)</label>
            <input
              value={refereePhone}
              onChange={(e) => setRefereePhone(e.target.value)}
              placeholder="+62812345678"
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-muted)]">
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              Lacak
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReferralClient({ storeId, currency = 'IDR' }: ReferralClientProps) {
  const qc = useQueryClient()
  const [showProgramModal, setShowProgramModal] = useState(false)
  const [showTrackModal, setShowTrackModal] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // ── Queries ──
  const { data: programs = [], isLoading: programsLoading, refetch: refetchPrograms } = useQuery<ReferralProgram[]>({
    queryKey: ['referral-programs', storeId],
    queryFn: () => fetch(`/api/referral-programs?storeId=${storeId}`).then((r) => r.json()),
  })

  const { data: referrals = [], isLoading: referralsLoading, refetch: refetchReferrals } = useQuery<CustomerReferral[]>({
    queryKey: ['referrals-list', storeId],
    queryFn: () => fetch(`/api/referrals?storeId=${storeId}`).then((r) => r.json()),
  })

  // ── Toggle program active ──
  const toggleProgram = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`/api/referral-programs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui program')
      return data
    },
    onSuccess: () => {
      toast.success('Program diperbarui')
      qc.invalidateQueries({ queryKey: ['referral-programs', storeId] })
    },
    onError: (e: any) => toast.error(e.message),
  })

  // ── Issue reward ──
  const rewardReferral = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/referrals/${id}/reward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.error || 'Gagal memberikan hadiah')
      return data
    },
    onSuccess: () => {
      toast.success('Hadiah berhasil diberikan')
      qc.invalidateQueries({ queryKey: ['referrals-list', storeId] })
    },
    onError: (e: any) => toast.error(e.message),
  })

  // ── Derived stats ──
  const conversionRate = calcConversionRate(referrals)
  const activeProgram = programs.find((p) => p.active)
  const totalRewards = activeProgram
    ? calcTotalRewardsIssued(referrals, activeProgram.rewardAmount)
    : 0

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
    })
  }

  const isLoading = programsLoading || referralsLoading

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)]">Program Referral</h1>
          <p className="text-sm text-[var(--text-3)]">Kelola referral pelanggan dan afiliasi marketing</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { refetchPrograms(); refetchReferrals() }}
            className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-2)] hover:bg-[var(--bg-muted)]"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowTrackModal(true)}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-muted)]"
          >
            <Share2 className="h-4 w-4" />
            Lacak Referral
          </button>
          <button
            onClick={() => setShowProgramModal(true)}
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Program Baru
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total Referral"
          value={referrals.length}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          icon={TrendingUp}
          label="Tingkat Konversi"
          value={`${conversionRate}%`}
          sub={`${referrals.filter((r) => r.status !== 'PENDING').length} dari ${referrals.length} dikonversi`}
          color="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          icon={Award}
          label="Hadiah Diberikan"
          value={referrals.filter((r) => r.status === 'REWARDED').length}
          color="bg-purple-50 text-purple-600"
        />
        <StatCard
          icon={Gift}
          label="Total Nilai Hadiah"
          value={
            activeProgram?.rewardType === 'POINTS'
              ? `${totalRewards} poin`
              : activeProgram?.rewardType === 'DISCOUNT'
              ? `${totalRewards}%`
              : formatCurrency(totalRewards, currency)
          }
          sub={activeProgram ? `Program: ${activeProgram.name}` : 'Tidak ada program aktif'}
          color="bg-amber-50 text-amber-600"
        />
      </div>

      {/* Programs */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-[var(--text-1)]">Program Aktif</h2>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-3)]" />
          </div>
        ) : programs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center">
            <Gift className="mx-auto mb-2 h-8 w-8 text-[var(--text-3)]" />
            <p className="text-sm text-[var(--text-3)]">Belum ada program referral. Buat yang pertama!</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((program) => (
              <div
                key={program.id}
                className={cn(
                  'rounded-xl border p-4 transition-all',
                  program.active
                    ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5'
                    : 'border-[var(--border)] bg-[var(--bg-card)]',
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <p className="font-semibold text-[var(--text-1)]">{program.name}</p>
                  <button
                    onClick={() => toggleProgram.mutate({ id: program.id, active: !program.active })}
                    className="shrink-0 text-[var(--text-3)] hover:text-[var(--accent)]"
                    title={program.active ? 'Nonaktifkan' : 'Aktifkan'}
                  >
                    {program.active
                      ? <ToggleRight className="h-5 w-5 text-[var(--accent)]" />
                      : <ToggleLeft className="h-5 w-5" />}
                  </button>
                </div>
                <p className="text-sm text-[var(--text-2)]">
                  Hadiah:{' '}
                  <span className="font-medium text-[var(--text-1)]">
                    {formatRewardLabel(program.rewardType, program.rewardAmount, currency)}
                  </span>
                  {' '}per referral
                </p>
                <p className="mt-1 text-xs text-[var(--text-3)]">
                  Dibuat {formatDate(program.createdAt)}
                </p>
                <span
                  className={cn(
                    'mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                    program.active
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-stone-100 text-stone-500',
                  )}
                >
                  {program.active ? 'Aktif' : 'Tidak Aktif'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Referrals table */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-[var(--text-1)]">Daftar Referral</h2>
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-muted)]">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Referrer</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Referee</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Kode</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Status</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Tanggal</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {referrals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-3)]">
                    Belum ada referral tercatat
                  </td>
                </tr>
              ) : (
                referrals.map((ref) => {
                  const cfg = STATUS_CONFIG[ref.status]
                  return (
                    <tr key={ref.id} className="hover:bg-[var(--bg-muted)]/50">
                      <td className="px-4 py-3 font-medium text-[var(--text-1)]">
                        {ref.referrerName}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-2)]">
                        {ref.refereeName ?? <span className="text-[var(--text-3)]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <code className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-1)]">
                            {ref.referralCode}
                          </code>
                          <button
                            onClick={() => copyCode(ref.referralCode)}
                            className="text-[var(--text-3)] hover:text-[var(--accent)]"
                          >
                            {copiedCode === ref.referralCode
                              ? <Check className="h-3.5 w-3.5 text-emerald-500" />
                              : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', cfg.color)}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-3)]">
                        {formatDate(ref.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        {ref.status === 'QUALIFIED' && (
                          <button
                            onClick={() => rewardReferral.mutate(ref.id)}
                            disabled={rewardReferral.isPending}
                            className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-100 disabled:opacity-60"
                          >
                            {rewardReferral.isPending
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Gift className="h-3 w-3" />}
                            Beri Hadiah
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showProgramModal && (
        <ProgramModal
          storeId={storeId}
          onClose={() => setShowProgramModal(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['referral-programs', storeId] })}
        />
      )}
      {showTrackModal && (
        <TrackModal
          onClose={() => setShowTrackModal(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['referrals-list', storeId] })}
        />
      )}
    </div>
  )
}
