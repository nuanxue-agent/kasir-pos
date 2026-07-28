'use client'

import { useState, useEffect, useCallback } from 'react'
import { Star, Plus, TrendingUp, TrendingDown, Minus, Award, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcOverallScore,
  validateScores,
  rankVendorsBySore,
  detectScoreTrend,
  selectPreferredVendors,
  buildVendorScorecard,
} from '@/lib/vendor-evaluation'

// Re-export pure functions for unit tests
export {
  calcOverallScore,
  validateScores,
  rankVendorsBySore,
  detectScoreTrend,
  selectPreferredVendors,
  buildVendorScorecard,
}

interface Vendor {
  id: string
  name: string
  contact?: string
}

interface VendorEvaluation {
  id: string
  storeId: string
  vendorId: string
  vendorName?: string
  orderId?: string | null
  deliveryScore: number
  qualityScore: number
  priceScore: number
  communicationScore: number
  overallScore: number
  notes?: string | null
  evaluatedAt: string
}

interface VendorScorecard {
  vendorId: string
  vendorName: string
  avgDelivery: number
  avgQuality: number
  avgPrice: number
  avgCommunication: number
  avgOverall: number
  evaluationCount: number
  trend: 'improving' | 'declining' | 'stable'
  isPreferred: boolean
}

interface Props {
  storeId: string
  vendors: Vendor[]
}

const SCORE_LABELS: Record<number, string> = {
  1: 'Sangat Buruk',
  2: 'Buruk',
  3: 'Cukup',
  4: 'Baik',
  5: 'Sangat Baik',
}

function StarRating({
  value,
  onChange,
  readOnly = false,
}: {
  value: number
  onChange?: (v: number) => void
  readOnly?: boolean
}) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => !readOnly && onChange?.(n)}
          onMouseEnter={() => !readOnly && setHovered(n)}
          onMouseLeave={() => !readOnly && setHovered(0)}
          className={cn(
            'transition-colors',
            readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
          )}
          aria-label={`${n} bintang`}
        >
          <Star
            size={18}
            className={cn(
              (hovered || value) >= n ? 'fill-yellow-400 text-yellow-400' : 'text-[var(--border)]'
            )}
          />
        </button>
      ))}
    </div>
  )
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = ((value - 1) / 4) * 100
  const color =
    value >= 4.5
      ? 'bg-green-500'
      : value >= 3.5
      ? 'bg-blue-500'
      : value >= 2.5
      ? 'bg-yellow-500'
      : 'bg-red-500'
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-[var(--text-2)]">
        <span>{label}</span>
        <span className="font-medium">{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--border)]">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function TrendIcon({ trend }: { trend: 'improving' | 'declining' | 'stable' }) {
  if (trend === 'improving') return <TrendingUp size={14} className="text-green-500" />
  if (trend === 'declining') return <TrendingDown size={14} className="text-red-500" />
  return <Minus size={14} className="text-[var(--text-3)]" />
}

const emptyForm = {
  vendorId: '',
  orderId: '',
  deliveryScore: 3,
  qualityScore: 3,
  priceScore: 3,
  communicationScore: 3,
  notes: '',
}

export default function VendorEvaluationClient({ storeId, vendors }: Props) {
  const [evaluations, setEvaluations] = useState<VendorEvaluation[]>([])
  const [scorecards, setScorecards] = useState<VendorScorecard[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [activeTab, setActiveTab] = useState<'scorecard' | 'history'>('scorecard')

  const fetchData = useCallback(async () => {
    try {
      const [evalRes, scoreRes] = await Promise.all([
        fetch(`/api/vendor-evaluations?storeId=${storeId}`),
        fetch(`/api/vendor-evaluations/scorecard?storeId=${storeId}`),
      ])
      const [evalData, scoreData] = await Promise.all([
        evalRes.json() as Promise<any>,
        scoreRes.json() as Promise<any>,
      ])
      if (!evalData.error) setEvaluations(evalData)
      if (!scoreData.error) setScorecards(scoreData)
    } catch {
      toast.error('Gagal memuat data evaluasi')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.vendorId) { toast.error('Pilih vendor terlebih dahulu'); return }
    const validation = validateScores(
      form.deliveryScore, form.qualityScore, form.priceScore, form.communicationScore
    )
    if (!validation.valid) { toast.error(validation.error ?? 'Skor tidak valid'); return }

    setSaving(true)
    try {
      const overall = calcOverallScore(
        form.deliveryScore, form.qualityScore, form.priceScore, form.communicationScore
      )
      const res = await fetch(`/api/vendor-evaluations?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, overallScore: overall }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Evaluasi berhasil disimpan')
      setForm(emptyForm)
      setShowForm(false)
      fetchData()
    } catch {
      toast.error('Gagal menyimpan evaluasi')
    } finally {
      setSaving(false)
    }
  }

  const ranked = rankVendorsBySore(scorecards)
  const preferred = selectPreferredVendors(scorecards)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-[var(--text-3)]" size={28} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Evaluasi Vendor</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Nilai kinerja vendor berdasarkan pengiriman, kualitas, harga, dan komunikasi
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          Tambah Evaluasi
        </button>
      </div>

      {/* Preferred vendors banner */}
      {preferred.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Award size={16} className="text-yellow-500" />
            <span className="text-sm font-semibold text-[var(--text-1)]">
              Vendor Pilihan ({preferred.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {preferred.map((v) => (
              <span
                key={v.vendorId}
                className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 border border-yellow-200 px-3 py-1 text-xs font-medium text-yellow-800"
              >
                <Star size={11} className="fill-yellow-400 text-yellow-400" />
                {v.vendorName}
                <span className="text-yellow-600">{v.avgOverall.toFixed(1)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {(['scorecard', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]'
            )}
          >
            {tab === 'scorecard' ? 'Scorecard Vendor' : 'Riwayat Evaluasi'}
          </button>
        ))}
      </div>

      {/* Scorecard tab */}
      {activeTab === 'scorecard' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ranked.length === 0 ? (
            <div className="col-span-full py-12 text-center text-[var(--text-3)]">
              Belum ada evaluasi vendor. Tambahkan evaluasi pertama Anda.
            </div>
          ) : (
            ranked.map((sc, idx) => (
              <div
                key={sc.vendorId}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {idx === 0 && <Award size={14} className="text-yellow-500" />}
                      <span className="font-semibold text-[var(--text-1)]">{sc.vendorName}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-2xl font-bold text-[var(--text-1)]">
                        {sc.avgOverall.toFixed(1)}
                      </span>
                      <span className="text-xs text-[var(--text-3)]">/ 5.0</span>
                      <TrendIcon trend={sc.trend} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[var(--text-3)]">{sc.evaluationCount}x dinilai</div>
                    {sc.isPreferred && (
                      <span className="text-xs font-medium text-yellow-600 bg-yellow-50 rounded-full px-2 py-0.5">
                        Pilihan
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <ScoreBar label="Pengiriman" value={sc.avgDelivery} />
                  <ScoreBar label="Kualitas" value={sc.avgQuality} />
                  <ScoreBar label="Harga" value={sc.avgPrice} />
                  <ScoreBar label="Komunikasi" value={sc.avgCommunication} />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* History tab */}
      {activeTab === 'history' && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-2)] text-[var(--text-2)]">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Vendor</th>
                <th className="px-4 py-3 text-center font-medium">Pengiriman</th>
                <th className="px-4 py-3 text-center font-medium">Kualitas</th>
                <th className="px-4 py-3 text-center font-medium">Harga</th>
                <th className="px-4 py-3 text-center font-medium">Komunikasi</th>
                <th className="px-4 py-3 text-center font-medium">Overall</th>
                <th className="px-4 py-3 text-left font-medium">Tanggal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {evaluations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[var(--text-3)]">
                    Belum ada riwayat evaluasi
                  </td>
                </tr>
              ) : (
                evaluations.map((ev) => (
                  <tr key={ev.id} className="bg-[var(--bg-card)] hover:bg-[var(--bg-2)] transition-colors">
                    <td className="px-4 py-3 font-medium text-[var(--text-1)]">
                      {ev.vendorName ?? vendors.find((v) => v.id === ev.vendorId)?.name ?? ev.vendorId}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StarRating value={ev.deliveryScore} readOnly />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StarRating value={ev.qualityScore} readOnly />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StarRating value={ev.priceScore} readOnly />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StarRating value={ev.communicationScore} readOnly />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-block rounded-full px-2 py-0.5 text-xs font-semibold',
                          ev.overallScore >= 4
                            ? 'bg-green-100 text-green-700'
                            : ev.overallScore >= 3
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-red-100 text-red-700'
                        )}
                      >
                        {ev.overallScore.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-3)]">
                      {new Date(ev.evaluatedAt).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add evaluation modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
              <h2 className="font-semibold text-[var(--text-1)]">Tambah Evaluasi Vendor</h2>
              <button
                onClick={() => { setShowForm(false); setForm(emptyForm) }}
                className="text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-5">
              {/* Vendor select */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-2)] mb-1.5">
                  Vendor <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.vendorId}
                  onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  required
                >
                  <option value="">Pilih vendor...</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>

              {/* Order ID (optional) */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-2)] mb-1.5">
                  No. PO / Pesanan (opsional)
                </label>
                <input
                  type="text"
                  value={form.orderId}
                  onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))}
                  placeholder="Contoh: PO-2024-001"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>

              {/* Score fields */}
              {(
                [
                  ['deliveryScore', 'Ketepatan Pengiriman'],
                  ['qualityScore', 'Kualitas Produk'],
                  ['priceScore', 'Kesesuaian Harga'],
                  ['communicationScore', 'Komunikasi'],
                ] as const
              ).map(([field, label]) => (
                <div key={field}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-[var(--text-2)]">{label}</label>
                    <span className="text-xs text-[var(--text-3)]">
                      {SCORE_LABELS[form[field]]}
                    </span>
                  </div>
                  <StarRating
                    value={form[field]}
                    onChange={(v) => setForm((f) => ({ ...f, [field]: v }))}
                  />
                </div>
              ))}

              {/* Live overall preview */}
              <div className="rounded-lg bg-[var(--bg-2)] px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-[var(--text-2)]">Skor Keseluruhan</span>
                <span className="text-xl font-bold text-[var(--text-1)]">
                  {calcOverallScore(
                    form.deliveryScore, form.qualityScore, form.priceScore, form.communicationScore
                  ).toFixed(2)}
                  <span className="text-sm font-normal text-[var(--text-3)] ml-1">/ 5</span>
                </span>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-2)] mb-1.5">
                  Catatan (opsional)
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Tambahkan catatan evaluasi..."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setForm(emptyForm) }}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Simpan Evaluasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
