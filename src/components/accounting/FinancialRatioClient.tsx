'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, Activity, DollarSign, BarChart2, RefreshCw, Plus, X } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcCurrentRatio,
  calcQuickRatio,
  calcGrossMargin,
  calcNetMargin,
  calcROA,
  calcROE,
  calcInventoryTurnover,
  calcDaysSalesOutstanding,
} from '@/lib/financial-ratios'

export {
  calcCurrentRatio,
  calcQuickRatio,
  calcGrossMargin,
  calcNetMargin,
  calcROA,
  calcROE,
  calcInventoryTurnover,
  calcDaysSalesOutstanding,
} from '@/lib/financial-ratios'

interface FinancialSnapshot {
  id: string
  storeId: string
  period: string
  totalAssets: number
  currentAssets: number
  currentLiabilities: number
  inventory: number
  revenue: number
  grossProfit: number
  netProfit: number
  equity: number
  receivables: number
  computedAt: string
  ratios?: {
    currentRatio: number
    quickRatio: number
    grossMargin: number
    netMargin: number
    roa: number
    roe: number
    inventoryTurnover: number
    daysSalesOutstanding: number
  }
}

interface Props {
  storeId: string
  currency: string
}

const TABS = ['overview', 'liquidity', 'profitability', 'efficiency', 'trend'] as const
type Tab = typeof TABS[number]

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Ringkasan',
  liquidity: 'Likuiditas',
  profitability: 'Profitabilitas',
  efficiency: 'Efisiensi',
  trend: 'Tren',
}

const RATIO_META = {
  currentRatio:          { label: 'Current Ratio',          unit: 'x',  good: (v: number) => v >= 1.5,  tip: '≥ 1.5 sehat' },
  quickRatio:            { label: 'Quick Ratio',             unit: 'x',  good: (v: number) => v >= 1,    tip: '≥ 1.0 sehat' },
  grossMargin:           { label: 'Gross Margin',            unit: '%',  good: (v: number) => v >= 30,   tip: '≥ 30% ideal' },
  netMargin:             { label: 'Net Margin',              unit: '%',  good: (v: number) => v >= 10,   tip: '≥ 10% ideal' },
  roa:                   { label: 'ROA',                     unit: '%',  good: (v: number) => v >= 5,    tip: '≥ 5% sehat' },
  roe:                   { label: 'ROE',                     unit: '%',  good: (v: number) => v >= 10,   tip: '≥ 10% baik' },
  inventoryTurnover:     { label: 'Inventory Turnover',      unit: 'x',  good: (v: number) => v >= 4,    tip: '≥ 4x/tahun' },
  daysSalesOutstanding:  { label: 'Days Sales Outstanding',  unit: 'hr', good: (v: number) => v <= 45,   tip: '≤ 45 hari baik' },
} as const

type RatioKey = keyof typeof RATIO_META

const EMPTY_FORM = {
  period: '',
  totalAssets: '',
  currentAssets: '',
  currentLiabilities: '',
  inventory: '',
  revenue: '',
  grossProfit: '',
  netProfit: '',
  equity: '',
  receivables: '',
}

function fmt(v: number, unit: string) {
  if (unit === '%') return `${v.toFixed(1)}%`
  if (unit === 'hr') return `${v.toFixed(0)} hr`
  return `${v.toFixed(2)}x`
}

function RatioBadge({ value, meta }: { value: number; meta: typeof RATIO_META[RatioKey] }) {
  const isGood = meta.good(value)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
        isGood
          ? 'bg-[color:var(--success-bg,#dcfce7)] text-[color:var(--success-fg,#166534)]'
          : 'bg-[color:var(--warn-bg,#fef9c3)] text-[color:var(--warn-fg,#854d0e)]',
      )}
    >
      {isGood ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {fmt(value, meta.unit)}
    </span>
  )
}

function RatioCard({ ratioKey, value }: { ratioKey: RatioKey; value: number }) {
  const meta = RATIO_META[ratioKey]
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-4 flex flex-col gap-2">
      <p className="text-xs text-[color:var(--muted-fg)] uppercase tracking-wide">{meta.label}</p>
      <p className="text-2xl font-bold text-[color:var(--fg)]">{fmt(value, meta.unit)}</p>
      <div className="flex items-center justify-between">
        <RatioBadge value={value} meta={meta} />
        <span className="text-xs text-[color:var(--muted-fg)]">{meta.tip}</span>
      </div>
    </div>
  )
}

// ── Mini sparkline (pure SVG, no chart lib) ────────────────────────────────
function Sparkline({ data, ratioKey }: { data: FinancialSnapshot[]; ratioKey: RatioKey }) {
  const values = data.map((s) => s.ratios?.[ratioKey] ?? 0)
  if (values.length < 2) return <p className="text-xs text-[color:var(--muted-fg)]">Data tidak cukup untuk tren</p>

  const W = 280
  const H = 60
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = H - ((v - min) / range) * H
    return `${x},${y}`
  })

  const meta = RATIO_META[ratioKey]
  const lastVal = values[values.length - 1]
  const prevVal = values[values.length - 2]
  const up = lastVal >= prevVal

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[color:var(--fg)]">{meta.label}</span>
        <span className={cn('text-xs font-semibold', up ? 'text-green-600' : 'text-amber-600')}>
          {up ? '▲' : '▼'} {fmt(lastVal, meta.unit)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16">
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke={up ? '#16a34a' : '#d97706'}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {values.map((v, i) => {
          const x = (i / (values.length - 1)) * W
          const y = H - ((v - min) / range) * H
          return <circle key={i} cx={x} cy={y} r="3" fill={up ? '#16a34a' : '#d97706'} />
        })}
      </svg>
      <div className="flex justify-between text-xs text-[color:var(--muted-fg)]">
        {data.map((s) => <span key={s.id}>{s.period}</span>)}
      </div>
    </div>
  )
}

export default function FinancialRatioClient({ storeId, currency }: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const { data: snapshots = [], isLoading } = useQuery<FinancialSnapshot[]>({
    queryKey: ['financial-ratios', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/financial-ratios?storeId=${storeId}`)
      return (await res.json()) as any
    },
  })

  const latest = snapshots[0] ?? null

  const addMut = useMutation({
    mutationFn: async (payload: typeof EMPTY_FORM) => {
      const res = await fetch(`/api/financial-snapshots?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: payload.period,
          totalAssets: Number(payload.totalAssets) || 0,
          currentAssets: Number(payload.currentAssets) || 0,
          currentLiabilities: Number(payload.currentLiabilities) || 0,
          inventory: Number(payload.inventory) || 0,
          revenue: Number(payload.revenue) || 0,
          grossProfit: Number(payload.grossProfit) || 0,
          netProfit: Number(payload.netProfit) || 0,
          equity: Number(payload.equity) || 0,
          receivables: Number(payload.receivables) || 0,
          computedAt: new Date().toISOString(),
        }),
      })
      const data = (await res.json()) as any
      if (!res.ok) throw new Error(data.error ?? 'Gagal menyimpan')
      return data
    },
    onSuccess: () => {
      toast.success('Snapshot keuangan disimpan')
      qc.invalidateQueries({ queryKey: ['financial-ratios', storeId] })
      setForm(EMPTY_FORM)
      setShowForm(false)
    },
    onError: (e: any) => toast.error(e.message ?? 'Terjadi kesalahan'),
  })

  const field = (key: keyof typeof EMPTY_FORM, label: string, type: 'text' | 'number' = 'number') => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[color:var(--muted-fg)]">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="rounded-lg border border-[color:var(--border)] bg-[color:var(--input-bg,var(--card))] px-3 py-2 text-sm text-[color:var(--fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
        placeholder={type === 'number' ? '0' : '2024-Q1'}
      />
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--fg)]">Analisis Rasio Keuangan</h1>
          <p className="text-sm text-[color:var(--muted-fg)] mt-1">
            Pantau likuiditas, profitabilitas, dan efisiensi bisnis
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-[color:var(--primary-fg)] hover:opacity-90 transition-opacity"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Batal' : 'Tambah Snapshot'}
        </button>
      </div>

      {/* Add snapshot form */}
      {showForm && (
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
          <h2 className="text-base font-semibold text-[color:var(--fg)] mb-4">Snapshot Keuangan Baru</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {field('period', 'Periode (misal: 2024-Q1)', 'text')}
            {field('totalAssets', 'Total Aset')}
            {field('currentAssets', 'Aset Lancar')}
            {field('currentLiabilities', 'Kewajiban Lancar')}
            {field('inventory', 'Persediaan')}
            {field('revenue', 'Pendapatan')}
            {field('grossProfit', 'Laba Kotor')}
            {field('netProfit', 'Laba Bersih')}
            {field('equity', 'Ekuitas')}
            {field('receivables', 'Piutang')}
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={() => addMut.mutate(form)}
              disabled={addMut.isPending || !form.period}
              className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-5 py-2 text-sm font-medium text-[color:var(--primary-fg)] hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {addMut.isPending && <RefreshCw className="w-4 h-4 animate-spin" />}
              Simpan
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[color:var(--border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-[color:var(--primary)] text-[color:var(--primary)]'
                : 'border-transparent text-[color:var(--muted-fg)] hover:text-[color:var(--fg)]',
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-[color:var(--muted-fg)]">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Memuat data...
        </div>
      )}

      {!isLoading && snapshots.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-[color:var(--muted-fg)]">
          <BarChart2 className="w-10 h-10 opacity-30" />
          <p className="text-sm">Belum ada snapshot keuangan. Tambahkan data pertama Anda.</p>
        </div>
      )}

      {!isLoading && latest?.ratios && (
        <>
          {/* Overview */}
          {tab === 'overview' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(Object.keys(RATIO_META) as RatioKey[]).map((k) => (
                <RatioCard key={k} ratioKey={k} value={latest.ratios![k]} />
              ))}
            </div>
          )}

          {/* Liquidity */}
          {tab === 'liquidity' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-[color:var(--muted-fg)]">
                Rasio likuiditas mengukur kemampuan perusahaan memenuhi kewajiban jangka pendek.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RatioCard ratioKey="currentRatio" value={latest.ratios.currentRatio} />
                <RatioCard ratioKey="quickRatio" value={latest.ratios.quickRatio} />
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-4 text-sm text-[color:var(--muted-fg)]">
                <p><strong>Current Ratio</strong> mengukur aset lancar vs kewajiban lancar. Nilai ≥ 1.5 menunjukkan bisnis mampu membayar utang jangka pendek.</p>
                <p className="mt-2"><strong>Quick Ratio</strong> lebih ketat — tidak menyertakan persediaan. Nilai ≥ 1.0 adalah tanda sehat.</p>
              </div>
            </div>
          )}

          {/* Profitability */}
          {tab === 'profitability' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-[color:var(--muted-fg)]">
                Rasio profitabilitas mengukur seberapa efektif perusahaan menghasilkan laba.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RatioCard ratioKey="grossMargin" value={latest.ratios.grossMargin} />
                <RatioCard ratioKey="netMargin" value={latest.ratios.netMargin} />
                <RatioCard ratioKey="roa" value={latest.ratios.roa} />
                <RatioCard ratioKey="roe" value={latest.ratios.roe} />
              </div>
            </div>
          )}

          {/* Efficiency */}
          {tab === 'efficiency' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-[color:var(--muted-fg)]">
                Rasio efisiensi mengukur seberapa baik perusahaan mengelola aset dan piutang.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RatioCard ratioKey="inventoryTurnover" value={latest.ratios.inventoryTurnover} />
                <RatioCard ratioKey="daysSalesOutstanding" value={latest.ratios.daysSalesOutstanding} />
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-4 text-sm text-[color:var(--muted-fg)]">
                <p><strong>Inventory Turnover</strong> ≥ 4x/tahun berarti stok berputar cepat dan modal tidak terjebak di persediaan.</p>
                <p className="mt-2"><strong>Days Sales Outstanding</strong> ≤ 45 hari berarti piutang tertagih cukup cepat.</p>
              </div>
            </div>
          )}

          {/* Trend */}
          {tab === 'trend' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(Object.keys(RATIO_META) as RatioKey[]).map((k) => (
                <div
                  key={k}
                  className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-4"
                >
                  <Sparkline
                    data={[...snapshots].reverse()}
                    ratioKey={k}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Period list */}
      {!isLoading && snapshots.length > 0 && (
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[color:var(--border)]">
            <h3 className="text-sm font-semibold text-[color:var(--fg)] flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Riwayat Snapshot ({snapshots.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border)] bg-[color:var(--muted-bg,var(--card))]">
                  <th className="text-left px-4 py-2 font-medium text-[color:var(--muted-fg)]">Periode</th>
                  <th className="text-right px-4 py-2 font-medium text-[color:var(--muted-fg)]">Pendapatan</th>
                  <th className="text-right px-4 py-2 font-medium text-[color:var(--muted-fg)]">Current Ratio</th>
                  <th className="text-right px-4 py-2 font-medium text-[color:var(--muted-fg)]">Gross Margin</th>
                  <th className="text-right px-4 py-2 font-medium text-[color:var(--muted-fg)]">Net Margin</th>
                  <th className="text-right px-4 py-2 font-medium text-[color:var(--muted-fg)]">ROE</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s, i) => (
                  <tr
                    key={s.id}
                    className={cn(
                      'border-b border-[color:var(--border)] transition-colors hover:bg-[color:var(--hover-bg,transparent)]',
                      i === 0 && 'font-medium',
                    )}
                  >
                    <td className="px-4 py-2 text-[color:var(--fg)]">{s.period}</td>
                    <td className="px-4 py-2 text-right text-[color:var(--fg)]">
                      {formatCurrency(s.revenue, currency)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s.ratios && <RatioBadge value={s.ratios.currentRatio} meta={RATIO_META.currentRatio} />}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s.ratios && <RatioBadge value={s.ratios.grossMargin} meta={RATIO_META.grossMargin} />}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s.ratios && <RatioBadge value={s.ratios.netMargin} meta={RATIO_META.netMargin} />}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s.ratios && <RatioBadge value={s.ratios.roe} meta={RATIO_META.roe} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
