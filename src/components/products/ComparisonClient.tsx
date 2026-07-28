'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, Minus, ExternalLink, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

type Advantage = 'CHEAPER' | 'COMPETITIVE' | 'EXPENSIVE'

interface Product {
  id: string
  name: string
  price: number
  sku?: string
}

interface CompetitorProduct {
  id: string
  storeId: string
  competitorName: string
  productName: string
  price: number
  url: string | null
  notes: string | null
  recordedAt: string
}

interface ComparisonReport {
  id: string
  storeId: string
  ourProductId: string
  competitorProductId: string
  priceDiff: number
  priceDiffPct: number
  advantage: Advantage
  createdAt: string
  ourProductName?: string
  ourProductPrice?: number
  competitorName?: string
  competitorProductName?: string
  competitorPrice?: number
}

interface ComparisonClientProps {
  storeId: string
  currency: string
  initialProducts: Product[]
  initialCompetitors: CompetitorProduct[]
  initialReports: ComparisonReport[]
}

type Tab = 'competitors' | 'reports' | 'positioning'

// ── Pure logic helpers (exported for tests) ────────────────────────────────────

export function calcPriceDiff(ourPrice: number, competitorPrice: number): number {
  return ourPrice - competitorPrice
}

export function calcPriceDiffPct(ourPrice: number, competitorPrice: number): number {
  if (competitorPrice === 0) return 0
  return Math.round(((ourPrice - competitorPrice) / competitorPrice) * 10000) / 100
}

export function determineAdvantage(ourPrice: number, competitorPrice: number): Advantage {
  const pct = calcPriceDiffPct(ourPrice, competitorPrice)
  if (pct < -2) return 'CHEAPER'
  if (pct > 5) return 'EXPENSIVE'
  return 'COMPETITIVE'
}

export function findCheapestCompetitor(
  competitors: CompetitorProduct[],
): CompetitorProduct | null {
  if (!competitors.length) return null
  return competitors.reduce((min, c) => (c.price < min.price ? c : min))
}

export interface PriceGapAnalysis {
  min: number
  max: number
  avg: number
  spread: number
  cheaperCount: number
  expensiveCount: number
  competitiveCount: number
}

export function analyzePriceGap(
  ourPrice: number,
  competitors: CompetitorProduct[],
): PriceGapAnalysis {
  if (!competitors.length) {
    return { min: ourPrice, max: ourPrice, avg: ourPrice, spread: 0, cheaperCount: 0, expensiveCount: 0, competitiveCount: 0 }
  }
  const prices = competitors.map(c => c.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
  const spread = max - min
  let cheaperCount = 0
  let expensiveCount = 0
  let competitiveCount = 0
  for (const c of competitors) {
    const adv = determineAdvantage(ourPrice, c.price)
    if (adv === 'CHEAPER') cheaperCount++
    else if (adv === 'EXPENSIVE') expensiveCount++
    else competitiveCount++
  }
  return { min, max, avg, spread, cheaperCount, expensiveCount, competitiveCount }
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

// ── Advantage badge ────────────────────────────────────────────────────────────

const ADVANTAGE_CONFIG: Record<Advantage, { label: string; icon: React.ReactNode; cls: string }> = {
  CHEAPER:     { label: 'Lebih Murah',   icon: <TrendingDown className="w-3 h-3" />, cls: 'bg-[var(--color-success)]/10 text-[var(--color-success)]' },
  COMPETITIVE: { label: 'Kompetitif',    icon: <Minus className="w-3 h-3" />,        cls: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' },
  EXPENSIVE:   { label: 'Lebih Mahal',   icon: <TrendingUp className="w-3 h-3" />,   cls: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'  },
}

function AdvantageBadge({ advantage }: { advantage: Advantage }) {
  const cfg = ADVANTAGE_CONFIG[advantage]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', cfg.cls)}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ── Add competitor form ────────────────────────────────────────────────────────

interface AddCompetitorFormProps {
  storeId: string
  onAdded: (c: CompetitorProduct) => void
}

function AddCompetitorForm({ storeId, onAdded }: AddCompetitorFormProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ competitorName: '', productName: '', price: '', url: '', notes: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.competitorName.trim() || !form.productName.trim() || !form.price) return
    setSaving(true)
    try {
      const res = await fetch('/api/competitor-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          competitorName: form.competitorName.trim(),
          productName: form.productName.trim(),
          price: Number(form.price),
          url: form.url.trim() || null,
          notes: form.notes.trim() || null,
        }),
      })
      const data = await res.json() as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal menyimpan'); return }
      toast.success('Produk pesaing ditambahkan')
      onAdded({ ...data, storeId, url: form.url.trim() || null, notes: form.notes.trim() || null, recordedAt: new Date().toISOString() })
      setForm({ competitorName: '', productName: '', price: '', url: '', notes: '' })
      setOpen(false)
    } catch {
      toast.error('Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity"
      >
        <Plus className="w-4 h-4" />
        Tambah Pesaing
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="border border-[var(--color-border)] rounded-xl p-4 bg-[var(--color-surface)] space-y-3">
      <p className="text-sm font-semibold text-[var(--color-fg)]">Produk Pesaing Baru</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--color-fg-muted)] mb-1">Nama Pesaing</label>
          <input
            className="w-full px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg)] text-sm"
            placeholder="Contoh: Toko ABC"
            value={form.competitorName}
            onChange={e => setForm(f => ({ ...f, competitorName: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-fg-muted)] mb-1">Nama Produk</label>
          <input
            className="w-full px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg)] text-sm"
            placeholder="Nama produk pesaing"
            value={form.productName}
            onChange={e => setForm(f => ({ ...f, productName: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-fg-muted)] mb-1">Harga (Rp)</label>
          <input
            type="number"
            min="0"
            className="w-full px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg)] text-sm"
            placeholder="0"
            value={form.price}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-fg-muted)] mb-1">URL (opsional)</label>
          <input
            type="url"
            className="w-full px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg)] text-sm"
            placeholder="https://..."
            value={form.url}
            onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-[var(--color-fg-muted)] mb-1">Catatan</label>
        <textarea
          rows={2}
          className="w-full px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg)] text-sm resize-none"
          placeholder="Catatan tambahan..."
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-muted)]/20">
          Batal
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </form>
  )
}

// ── Positioning map ────────────────────────────────────────────────────────────

interface PositioningMapProps {
  ourPrice: number
  competitors: CompetitorProduct[]
  currency: string
}

function PositioningMap({ ourPrice, competitors, currency }: PositioningMapProps) {
  if (!competitors.length) {
    return (
      <div className="text-center py-8 text-sm text-[var(--color-fg-muted)]">
        Belum ada data pesaing untuk ditampilkan.
      </div>
    )
  }

  const allPrices = [ourPrice, ...competitors.map(c => c.price)]
  const minPrice = Math.min(...allPrices)
  const maxPrice = Math.max(...allPrices)
  const range = maxPrice - minPrice || 1

  function pct(price: number) {
    return Math.round(((price - minPrice) / range) * 100)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-fg-muted)] font-medium uppercase tracking-wide">Peta Posisi Harga</p>
      <div className="relative h-10 bg-[var(--color-muted)]/10 rounded-full overflow-hidden">
        <div className="absolute inset-0 flex items-center px-4">
          <div className="relative w-full h-1 bg-[var(--color-border)] rounded-full">
            {competitors.map(c => {
              const adv = determineAdvantage(ourPrice, c.price)
              const cfg = ADVANTAGE_CONFIG[adv]
              return (
                <div
                  key={c.id}
                  title={`${c.competitorName}: ${fmt(c.price, currency)}`}
                  style={{ left: `${pct(c.price)}%` }}
                  className={cn('absolute -translate-x-1/2 -translate-y-1/2 top-1/2 w-3 h-3 rounded-full border-2 border-white cursor-pointer', cfg.cls.includes('success') ? 'bg-[var(--color-success)]' : cfg.cls.includes('danger') ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-warning)]')}
                />
              )
            })}
            <div
              title={`Produk Anda: ${fmt(ourPrice, currency)}`}
              style={{ left: `${pct(ourPrice)}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 top-1/2 w-4 h-4 rounded-full bg-[var(--color-primary)] border-2 border-white cursor-pointer z-10"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-between text-xs text-[var(--color-fg-muted)]">
        <span>{fmt(minPrice, currency)}</span>
        <span>{fmt(maxPrice, currency)}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-[var(--color-fg-muted)]">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[var(--color-primary)] inline-block" /> Produk Anda</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[var(--color-success)] inline-block" /> Lebih Murah</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[var(--color-warning)] inline-block" /> Kompetitif</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[var(--color-danger)] inline-block" /> Lebih Mahal</span>
      </div>
    </div>
  )
}

// ── Gap analysis summary cards ─────────────────────────────────────────────────

function GapAnalysisCards({ ourPrice, competitors, currency }: PositioningMapProps) {
  const gap = analyzePriceGap(ourPrice, competitors)
  const cheapest = findCheapestCompetitor(competitors)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <p className="text-xs text-[var(--color-fg-muted)]">Harga Terendah Pesaing</p>
        <p className="text-lg font-bold text-[var(--color-fg)] mt-0.5">{fmt(gap.min, currency)}</p>
        {cheapest && <p className="text-xs text-[var(--color-fg-muted)] mt-0.5">{cheapest.competitorName}</p>}
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <p className="text-xs text-[var(--color-fg-muted)]">Rata-rata Pesaing</p>
        <p className="text-lg font-bold text-[var(--color-fg)] mt-0.5">{fmt(gap.avg, currency)}</p>
        <p className="text-xs text-[var(--color-fg-muted)] mt-0.5">{competitors.length} pesaing</p>
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <p className="text-xs text-[var(--color-fg-muted)]">Selisih Harga (vs rata-rata)</p>
        {(() => {
          const diff = ourPrice - gap.avg
          const isNeg = diff < 0
          return (
            <>
              <p className={cn('text-lg font-bold mt-0.5', isNeg ? 'text-[var(--color-success)]' : diff === 0 ? 'text-[var(--color-fg)]' : 'text-[var(--color-danger)]')}>
                {isNeg ? '-' : '+'}{fmt(Math.abs(diff), currency)}
              </p>
              <p className="text-xs text-[var(--color-fg-muted)] mt-0.5">
                {isNeg ? 'Lebih murah' : diff === 0 ? 'Sama' : 'Lebih mahal'}
              </p>
            </>
          )
        })()}
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <p className="text-xs text-[var(--color-fg-muted)]">Distribusi Posisi</p>
        <div className="flex gap-2 mt-1.5">
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-success)]/10 text-[var(--color-success)]">{gap.cheaperCount} lebih murah</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-warning)]/10 text-[var(--color-warning)]">{gap.competitiveCount} kompetitif</span>
        </div>
        <div className="mt-1">
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-danger)]/10 text-[var(--color-danger)]">{gap.expensiveCount} lebih mahal</span>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ComparisonClient({
  storeId,
  currency,
  initialProducts,
  initialCompetitors,
  initialReports,
}: ComparisonClientProps) {
  const [tab, setTab] = useState<Tab>('competitors')
  const [competitors, setCompetitors] = useState<CompetitorProduct[]>(initialCompetitors)
  const [reports, setReports] = useState<ComparisonReport[]>(initialReports)
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProducts[0]?.id ?? '')
  const [loadingReport, setLoadingReport] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const selectedProduct = initialProducts.find(p => p.id === selectedProductId) ?? null

  const handleCompetitorAdded = useCallback((c: CompetitorProduct) => {
    setCompetitors(prev => [c, ...prev])
  }, [])

  async function generateReport() {
    if (!selectedProduct || !competitors.length) return
    setLoadingReport(true)
    try {
      for (const c of competitors) {
        const diff = calcPriceDiff(selectedProduct.price, c.price)
        const diffPct = calcPriceDiffPct(selectedProduct.price, c.price)
        const advantage = determineAdvantage(selectedProduct.price, c.price)
        const res = await fetch('/api/comparison-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            ourProductId: selectedProduct.id,
            competitorProductId: c.id,
            priceDiff: diff,
            priceDiffPct: diffPct,
            advantage,
          }),
        })
        const data = await res.json() as any
        if (!res.ok) { toast.error(data.error ?? 'Gagal membuat laporan'); return }
      }
      toast.success('Laporan perbandingan dibuat')
      await refreshReports()
    } catch {
      toast.error('Terjadi kesalahan')
    } finally {
      setLoadingReport(false)
    }
  }

  async function refreshReports() {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/comparison-reports?storeId=${storeId}`)
      const data = await res.json() as any
      if (res.ok) setReports(Array.isArray(data) ? data : [])
    } finally {
      setRefreshing(false)
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'competitors', label: 'Data Pesaing' },
    { key: 'reports',     label: 'Laporan Perbandingan' },
    { key: 'positioning', label: 'Peta Posisi' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-fg)]">Analisis Kompetitor</h1>
          <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">
            Bandingkan harga produk Anda dengan pesaing di pasar.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refreshReports}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:bg-[var(--color-muted)]/20 disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            Refresh
          </button>
          <AddCompetitorForm storeId={storeId} onAdded={handleCompetitorAdded} />
        </div>
      </div>

      {/* Product selector */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <BarChart2 className="w-5 h-5 text-[var(--color-primary)] shrink-0" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <label className="text-sm text-[var(--color-fg-muted)] shrink-0">Produk saya:</label>
          <select
            value={selectedProductId}
            onChange={e => setSelectedProductId(e.target.value)}
            className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg)] text-sm"
          >
            {initialProducts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        {selectedProduct && (
          <span className="text-sm font-semibold text-[var(--color-primary)] shrink-0">
            {new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(selectedProduct.price)}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Data Pesaing */}
      {tab === 'competitors' && (
        <div className="space-y-3">
          {!competitors.length ? (
            <div className="text-center py-12 text-sm text-[var(--color-fg-muted)]">
              Belum ada data pesaing. Tambahkan produk pesaing untuk memulai analisis.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">Pesaing</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">Produk</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">Harga</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">Posisi</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">URL</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">Dicatat</th>
                  </tr>
                </thead>
                <tbody>
                  {competitors.map((c, i) => {
                    const adv = selectedProduct ? determineAdvantage(selectedProduct.price, c.price) : null
                    return (
                      <tr key={c.id} className={cn('border-b border-[var(--color-border)] last:border-0', i % 2 === 0 ? 'bg-[var(--color-bg)]' : 'bg-[var(--color-surface)]')}>
                        <td className="px-4 py-2.5 font-medium text-[var(--color-fg)]">{c.competitorName}</td>
                        <td className="px-4 py-2.5 text-[var(--color-fg-muted)]">{c.productName}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[var(--color-fg)]">
                          {new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(c.price)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {adv && <AdvantageBadge advantage={adv} />}
                        </td>
                        <td className="px-4 py-2.5">
                          {c.url
                            ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline text-xs"><ExternalLink className="w-3 h-3" />Buka</a>
                            : <span className="text-[var(--color-fg-muted)] text-xs">-</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-fg-muted)]">
                          {new Date(c.recordedAt).toLocaleDateString('id-ID')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Laporan Perbandingan */}
      {tab === 'reports' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={generateReport}
              disabled={loadingReport || !selectedProduct || !competitors.length}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {loadingReport ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
              Buat Laporan
            </button>
          </div>
          {!reports.length ? (
            <div className="text-center py-12 text-sm text-[var(--color-fg-muted)]">
              Belum ada laporan. Pilih produk dan klik Buat Laporan.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">Produk Kami</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">Pesaing</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">Selisih</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">Selisih %</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">Posisi</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-fg-muted)] uppercase tracking-wide">Dibuat</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r, i) => (
                    <tr key={r.id} className={cn('border-b border-[var(--color-border)] last:border-0', i % 2 === 0 ? 'bg-[var(--color-bg)]' : 'bg-[var(--color-surface)]')}>
                      <td className="px-4 py-2.5 font-medium text-[var(--color-fg)]">{r.ourProductName ?? r.ourProductId}</td>
                      <td className="px-4 py-2.5 text-[var(--color-fg-muted)]">{r.competitorName ? `${r.competitorName} — ${r.competitorProductName}` : r.competitorProductId}</td>
                      <td className={cn('px-4 py-2.5 text-right font-mono', r.priceDiff < 0 ? 'text-[var(--color-success)]' : r.priceDiff > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg)]')}>
                        {r.priceDiff >= 0 ? '+' : ''}{new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(r.priceDiff)}
                      </td>
                      <td className={cn('px-4 py-2.5 text-right font-mono', r.priceDiffPct < 0 ? 'text-[var(--color-success)]' : r.priceDiffPct > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg)]')}>
                        {r.priceDiffPct >= 0 ? '+' : ''}{r.priceDiffPct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <AdvantageBadge advantage={r.advantage} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-fg-muted)]">
                        {new Date(r.createdAt).toLocaleDateString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Peta Posisi */}
      {tab === 'positioning' && selectedProduct && (
        <div className="space-y-6">
          <GapAnalysisCards ourPrice={selectedProduct.price} competitors={competitors} currency={currency} />
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <PositioningMap ourPrice={selectedProduct.price} competitors={competitors} currency={currency} />
          </div>
        </div>
      )}
    </div>
  )
}
