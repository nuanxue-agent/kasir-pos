'use client'

import { useState, useCallback, useEffect } from 'react'
import { Trophy, Medal, Award, Crown, TrendingUp, Users, Star, BarChart3, RefreshCw, ChevronDown } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcOverallScore,
  calcBadge,
  rankEntries,
  calcSalesScore,
  calcAttendanceScore,
  calcCustomerScore,
  aggregatePeriodScores,
  getBadgeConfig,
  DEFAULT_WEIGHTS,
} from '@/lib/performance-score'
import type { BadgeTier, ScoreComponents, ScoreWeights, PeriodEntry } from '@/lib/performance-score'

// Re-export pure functions for unit tests
export {
  calcOverallScore,
  calcBadge,
  rankEntries,
  calcSalesScore,
  calcAttendanceScore,
  calcCustomerScore,
  aggregatePeriodScores,
  getBadgeConfig,
}
export type { BadgeTier, ScoreComponents, ScoreWeights, PeriodEntry }

// ─── Types ──────────────────────────────────────────────────────────────────

interface PerformanceScore {
  id: string
  storeId: string
  employeeId: string
  employeeName?: string
  period: string           // YYYY-MM
  salesScore: number
  attendanceScore: number
  customerScore: number
  overallScore: number
  rank: number
  badge: BadgeTier
  createdAt: string
  updatedAt: string
}

interface Props {
  storeId: string
  employees: Array<{ id: string; name: string; role?: string }>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function currentMonthISO() {
  return new Date().toISOString().slice(0, 7)
}

function monthLabel(period: string) {
  const [year, month] = period.split('-')
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  })
}

// ─── Style constants ─────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const btnPrimary =
  'inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

const btnSecondary =
  'inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[var(--text-1)] text-sm font-medium rounded-xl border border-[var(--border)] transition-colors'

// ─── Sub-components ──────────────────────────────────────────────────────────

function ScoreGauge({ score, size = 80 }: { score: number; size?: number }) {
  const r = size / 2 - 8
  const circ = 2 * Math.PI * r
  const arc = (score / 100) * circ
  const color =
    score >= 90 ? '#22d3ee'
    : score >= 75 ? '#facc15'
    : score >= 60 ? '#94a3b8'
    : '#fb923c'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={7} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${arc} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fontSize={size * 0.22} fontWeight="bold" fill={color}>
        {score}
      </text>
      <text x={size / 2} y={size / 2 + 10} textAnchor="middle" fontSize={size * 0.12} fill="var(--text-3)">
        /100
      </text>
    </svg>
  )
}

function BadgePill({ badge }: { badge: BadgeTier }) {
  const cfg = getBadgeConfig(badge)
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold', cfg.bg, cfg.color)}>
      {cfg.emoji} {cfg.label}
    </span>
  )
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />
  if (rank === 2) return <Medal className="w-5 h-5 text-slate-300" />
  if (rank === 3) return <Award className="w-5 h-5 text-orange-400" />
  return <span className="text-sm font-bold text-[var(--text-3)]">#{rank}</span>
}

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text-2)]">{label}</span>
        <span className="font-medium text-[var(--text-1)]">{score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PerformanceScoreClient({ storeId, employees }: Props) {
  const [scores, setScores] = useState<PerformanceScore[]>([])
  const [loading, setLoading] = useState(false)
  const [computing, setComputing] = useState(false)
  const [period, setPeriod] = useState(currentMonthISO())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Form state for manual entry
  const [form, setForm] = useState({
    employeeId: '',
    salesScore: '',
    attendanceScore: '',
    customerScore: '',
  })

  const fetchScores = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/hr/performance-scores?storeId=${storeId}&period=${period}`)
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }
      setScores(data as PerformanceScore[])
    } catch {
      toast.error('Gagal memuat data skor')
    } finally {
      setLoading(false)
    }
  }, [storeId, period])

  useEffect(() => { fetchScores() }, [fetchScores])

  const handleCompute = async () => {
    setComputing(true)
    try {
      const res = await fetch(`/api/hr/performance-scores/compute?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      })
      const data = await res.json() as any
      if (data.error) { toast.error(data.error); return }
      toast.success(`${data.count ?? 0} skor karyawan berhasil dihitung`)
      await fetchScores()
    } catch {
      toast.error('Gagal menghitung skor')
    } finally {
      setComputing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.employeeId) { toast.error('Pilih karyawan'); return }

    const salesScore = Number(form.salesScore)
    const attendanceScore = Number(form.attendanceScore)
    const customerScore = Number(form.customerScore)
    const overallScore = calcOverallScore({ salesScore, attendanceScore, customerScore })
    const badge = calcBadge(overallScore)

    const res = await fetch(`/api/hr/performance-scores?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: form.employeeId, period, salesScore, attendanceScore, customerScore, overallScore, badge }),
    })
    const data = await res.json() as any
    if (data.error) { toast.error(data.error); return }
    toast.success('Skor berhasil disimpan')
    setShowForm(false)
    setForm({ employeeId: '', salesScore: '', attendanceScore: '', customerScore: '' })
    await fetchScores()
  }

  const selected = selectedId ? scores.find(s => s.id === selectedId) ?? null : null

  // Leaderboard sorted by rank
  const leaderboard = [...scores].sort((a, b) => a.rank - b.rank)

  // Stats summary
  const avgScore = scores.length
    ? Math.round(scores.reduce((acc, s) => acc + s.overallScore, 0) / scores.length)
    : 0
  const platinumCount = scores.filter(s => s.badge === 'PLATINUM').length
  const topPerformer = leaderboard[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Skor Performa Karyawan</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">KPI: Penjualan · Kehadiran · Rating Pelanggan</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className={cn(inputCls, 'w-auto')}
          />
          <button onClick={handleCompute} disabled={computing} className={btnSecondary}>
            <RefreshCw className={cn('w-4 h-4', computing && 'animate-spin')} />
            {computing ? 'Menghitung…' : 'Hitung Otomatis'}
          </button>
          <button onClick={() => setShowForm(v => !v)} className={btnPrimary}>
            <BarChart3 className="w-4 h-4" />
            Input Manual
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Users, label: 'Total Karyawan', value: scores.length, color: 'text-blue-400' },
          { icon: TrendingUp, label: 'Rata-rata Skor', value: avgScore, color: 'text-green-400' },
          { icon: Crown, label: 'Platinum', value: platinumCount, color: 'text-cyan-400' },
          { icon: Trophy, label: 'Terbaik', value: topPerformer?.employeeName ?? '—', color: 'text-yellow-400' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn('w-4 h-4', color)} />
              <span className="text-xs text-[var(--text-3)]">{label}</span>
            </div>
            <div className="text-xl font-bold text-[var(--text-1)] truncate">{value}</div>
          </div>
        ))}
      </div>

      {/* Manual entry form */}
      {showForm && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5">
          <h2 className="font-semibold text-[var(--text-1)] mb-4">Input Skor Manual — {monthLabel(period)}</h2>
          <form onSubmit={handleSubmit} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--text-3)] mb-1">Karyawan</label>
              <select
                value={form.employeeId}
                onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                className={inputCls}
                required
              >
                <option value="">Pilih karyawan…</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-3)] mb-1">
                Skor Penjualan (0–100) <span className="text-[var(--text-3)]">bobot 40%</span>
              </label>
              <input
                type="number" min={0} max={100}
                value={form.salesScore}
                onChange={e => setForm(f => ({ ...f, salesScore: e.target.value }))}
                className={inputCls}
                placeholder="0–100"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-3)] mb-1">
                Skor Kehadiran (0–100) <span className="text-[var(--text-3)]">bobot 35%</span>
              </label>
              <input
                type="number" min={0} max={100}
                value={form.attendanceScore}
                onChange={e => setForm(f => ({ ...f, attendanceScore: e.target.value }))}
                className={inputCls}
                placeholder="0–100"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-3)] mb-1">
                Skor Rating Pelanggan (0–100) <span className="text-[var(--text-3)]">bobot 25%</span>
              </label>
              <input
                type="number" min={0} max={100}
                value={form.customerScore}
                onChange={e => setForm(f => ({ ...f, customerScore: e.target.value }))}
                className={inputCls}
                placeholder="0–100"
                required
              />
            </div>
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className={btnSecondary}>Batal</button>
              <button type="submit" className={btnPrimary}>Simpan Skor</button>
            </div>
          </form>
        </div>
      )}

      {/* Leaderboard + Detail layout */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Leaderboard */}
        <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span className="font-semibold text-[var(--text-1)]">Leaderboard — {monthLabel(period)}</span>
            <span className="ml-auto text-xs text-[var(--text-3)]">{scores.length} karyawan</span>
          </div>

          {loading ? (
            <div className="py-16 text-center text-[var(--text-3)]">Memuat…</div>
          ) : leaderboard.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-3)]">
              Belum ada data skor untuk periode ini.<br />
              <span className="text-xs">Klik "Hitung Otomatis" atau "Input Manual".</span>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {leaderboard.map(score => (
                <button
                  key={score.id}
                  onClick={() => setSelectedId(selectedId === score.id ? null : score.id)}
                  className={cn(
                    'w-full px-5 py-3.5 flex items-center gap-4 hover:bg-[var(--bg-2)] transition-colors text-left',
                    selectedId === score.id && 'bg-[var(--bg-2)]',
                  )}
                >
                  <div className="w-8 flex justify-center">
                    <RankIcon rank={score.rank} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[var(--text-1)] truncate">
                      {score.employeeName ?? score.employeeId}
                    </div>
                    <div className="text-xs text-[var(--text-3)] mt-0.5">
                      Penjualan: {score.salesScore} · Kehadiran: {score.attendanceScore} · Pelanggan: {score.customerScore}
                    </div>
                  </div>
                  <BadgePill badge={score.badge} />
                  <ScoreGauge score={score.overallScore} size={52} />
                  <ChevronDown className={cn('w-4 h-4 text-[var(--text-3)] flex-shrink-0 transition-transform', selectedId === score.id && 'rotate-180')} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="space-y-4">
          {selected ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Star className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="font-semibold text-[var(--text-1)]">
                    {selected.employeeName ?? selected.employeeId}
                  </div>
                  <div className="text-xs text-[var(--text-3)]">{monthLabel(selected.period)}</div>
                </div>
              </div>

              <div className="flex justify-center">
                <ScoreGauge score={selected.overallScore} size={100} />
              </div>

              <div className="flex justify-center">
                <BadgePill badge={selected.badge} />
              </div>

              <div className="space-y-3">
                <ScoreBar label="Penjualan (40%)" score={selected.salesScore} color="bg-blue-500" />
                <ScoreBar label="Kehadiran (35%)" score={selected.attendanceScore} color="bg-green-500" />
                <ScoreBar label="Rating Pelanggan (25%)" score={selected.customerScore} color="bg-purple-500" />
              </div>

              <div className="text-xs text-[var(--text-3)] text-center">
                Overall = Sales×0.4 + Kehadiran×0.35 + Pelanggan×0.25
              </div>
            </div>
          ) : (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5">
              <div className="text-center text-[var(--text-3)] py-8">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Pilih karyawan untuk melihat detail skor
              </div>
            </div>
          )}

          {/* Badge legend */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4">
            <div className="text-xs font-semibold text-[var(--text-2)] mb-3">Ketentuan Badge</div>
            <div className="space-y-2">
              {(['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'] as BadgeTier[]).map(b => {
                const cfg = getBadgeConfig(b)
                const range =
                  b === 'PLATINUM' ? '90–100' : b === 'GOLD' ? '75–89' : b === 'SILVER' ? '60–74' : '0–59'
                return (
                  <div key={b} className="flex items-center justify-between">
                    <span className={cn('text-xs font-medium', cfg.color)}>{cfg.emoji} {cfg.label}</span>
                    <span className="text-xs text-[var(--text-3)]">{range}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
