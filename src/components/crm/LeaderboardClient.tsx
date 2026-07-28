'use client'

import { useState, useEffect } from 'react'
import { Trophy, Medal, Award, Plus, X, Loader2, Crown } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

interface LeaderboardEntry {
  id: string
  storeId: string
  period: string
  customerId: string
  rank: number
  points: number
  totalSpend: number
  visitCount: number
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  updatedAt: string
}

interface LeaderboardPrize {
  id: string
  storeId: string
  period: string
  rank: number
  prize: string
  claimed: boolean
  claimedAt?: string
}

interface LeaderboardClientProps {
  storeId: string
  currency: string
}

type Period = 'WEEKLY' | 'MONTHLY' | 'ALL_TIME'

export function calcRankBadge(rank: number): { icon: any; color: string; label: string } {
  if (rank === 1) return { icon: Crown, color: 'text-yellow-500', label: '🥇 Champion' }
  if (rank === 2) return { icon: Medal, color: 'text-gray-400', label: '🥈 Runner-up' }
  if (rank === 3) return { icon: Award, color: 'text-orange-600', label: '🥉 Third Place' }
  return { icon: Trophy, color: 'text-[var(--text-3)]', label: `#${rank}` }
}

export default function LeaderboardClient({ storeId, currency }: LeaderboardClientProps) {
  const [period, setPeriod] = useState<Period>('MONTHLY')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [prizes, setPrizes] = useState<LeaderboardPrize[]>([])
  const [loading, setLoading] = useState(true)
  const [showPrizeModal, setShowPrizeModal] = useState(false)
  const [prizeForm, setPrizeForm] = useState({ rank: 1, prize: '', period: 'MONTHLY' as Period })
  const [savingPrize, setSavingPrize] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [entriesRes, prizesRes] = await Promise.all([
        fetch(`/api/leaderboard?storeId=${storeId}&period=${period}`),
        fetch(`/api/leaderboard/prizes?storeId=${storeId}&period=${period}`),
      ])
      const entriesData = (await entriesRes.json()) as any
      const prizesData = (await prizesRes.json()) as any
      if (entriesData.error) throw new Error(entriesData.error)
      if (prizesData.error) throw new Error(prizesData.error)
      setEntries(entriesData)
      setPrizes(prizesData)
    } catch (error: any) {
      toast.error(error.message ?? 'Failed to fetch leaderboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [storeId, period])

  const handleAddPrize = async () => {
    if (!prizeForm.prize.trim()) {
      toast.error('Prize description is required')
      return
    }
    if (prizeForm.rank < 1) {
      toast.error('Rank must be at least 1')
      return
    }

    setSavingPrize(true)
    try {
      const res = await fetch(`/api/leaderboard/prizes?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prizeForm),
      })
      const data = (await res.json()) as any
      if (data.error) throw new Error(data.error)
      toast.success('Prize added')
      setShowPrizeModal(false)
      setPrizeForm({ rank: 1, prize: '', period: 'MONTHLY' })
      fetchAll()
    } catch (error: any) {
      toast.error(error.message ?? 'Failed to add prize')
    } finally {
      setSavingPrize(false)
    }
  }

  const handleClaimPrize = async (prizeId: string) => {
    try {
      const res = await fetch(`/api/leaderboard/prizes/${prizeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim: true }),
      })
      const data = (await res.json()) as any
      if (data.error) throw new Error(data.error)
      toast.success('Prize marked as claimed')
      fetchAll()
    } catch (error: any) {
      toast.error(error.message ?? 'Failed to claim prize')
    }
  }

  const getBadgeForEntry = (entry: LeaderboardEntry) => {
    const { icon: Icon, color, label } = calcRankBadge(entry.rank)
    return (
      <div className="flex items-center gap-2">
        <Icon className={cn('h-5 w-5', color)} />
        <span className="text-sm font-medium">{label}</span>
      </div>
    )
  }

  const prizesForPeriod = prizes.filter(p => p.period === period)

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Customer Leaderboard</h1>
          <p className="text-sm text-[var(--text-3)]">Gamify loyalty with seasonal competitions</p>
        </div>
        <button
          onClick={() => {
            setPrizeForm({ rank: 1, prize: '', period })
            setShowPrizeModal(true)
          }}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add Prize
        </button>
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {(['WEEKLY', 'MONTHLY', 'ALL_TIME'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              period === p
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--bg-card)] text-[var(--text-2)] hover:bg-[var(--bg-2)]',
            )}
          >
            {p.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Prizes section */}
      {prizesForPeriod.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-1)]">Active Prizes</h2>
          <div className="space-y-2">
            {prizesForPeriod.map(prize => (
              <div
                key={prize.id}
                className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--bg-1)] p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-bold text-white">
                    {prize.rank}
                  </div>
                  <div>
                    <p className="font-medium text-[var(--text-1)]">{prize.prize}</p>
                    {prize.claimed && prize.claimedAt && (
                      <p className="text-xs text-[var(--text-3)]">
                        Claimed on {new Date(prize.claimedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                {!prize.claimed && (
                  <button
                    onClick={() => handleClaimPrize(prize.id)}
                    className="text-sm text-[var(--primary)] hover:underline"
                  >
                    Mark Claimed
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leaderboard table */}
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-[var(--border)] bg-[var(--bg-2)]">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-1)]">
                  Rank
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-1)]">
                  Customer
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-[var(--text-1)]">
                  Points
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-[var(--text-1)]">
                  Total Spend
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-[var(--text-1)]">
                  Visits
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-1)]">
                  Badge
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--text-3)]" />
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--text-3)]">
                    No leaderboard entries yet for this period
                  </td>
                </tr>
              ) : (
                entries.map(entry => (
                  <tr
                    key={entry.id}
                    className="border-b border-[var(--border)] hover:bg-[var(--bg-2)]"
                  >
                    <td className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-1)]">
                      #{entry.rank}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-1)]">
                          {entry.customerName || 'Unknown'}
                        </p>
                        {entry.customerEmail && (
                          <p className="text-xs text-[var(--text-3)]">{entry.customerEmail}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-[var(--text-2)]">
                      {entry.points.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-[var(--text-2)]">
                      {formatCurrency(entry.totalSpend, currency)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-[var(--text-2)]">
                      {entry.visitCount}
                    </td>
                    <td className="px-4 py-3">{getBadgeForEntry(entry)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add prize modal */}
      {showPrizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-1)]">Add Prize</h2>
              <button onClick={() => setShowPrizeModal(false)}>
                <X className="h-5 w-5 text-[var(--text-3)]" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Rank</label>
                <input
                  type="number"
                  min={1}
                  value={prizeForm.rank}
                  onChange={e =>
                    setPrizeForm({ ...prizeForm, rank: parseInt(e.target.value) || 1 })
                  }
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Prize</label>
                <input
                  type="text"
                  value={prizeForm.prize}
                  onChange={e => setPrizeForm({ ...prizeForm, prize: e.target.value })}
                  placeholder="e.g., $50 gift card, Free product"
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">
                  Period
                </label>
                <select
                  value={prizeForm.period}
                  onChange={e => setPrizeForm({ ...prizeForm, period: e.target.value as Period })}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)]"
                >
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="ALL_TIME">All Time</option>
                </select>
              </div>
              <button
                onClick={handleAddPrize}
                disabled={savingPrize}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {savingPrize && <Loader2 className="h-4 w-4 animate-spin" />}
                {savingPrize ? 'Saving...' : 'Add Prize'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
