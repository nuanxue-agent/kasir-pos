'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/utils'
import { ExportButton } from '@/components/ExportButton'
import type { ExportColumn } from '@/lib/export'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface PnLClientProps {
  storeId: string
  currency: string
}

type PeriodType = 'month' | 'quarter' | 'year' | 'custom'

interface PnLAccount {
  name: string
  code: string
  amount: number
}

interface PnLData {
  revenue: PnLAccount[]
  cogs: PnLAccount[]
  operatingExpenses: PnLAccount[]
  totals: {
    revenue: number
    cogs: number
    grossProfit: number
    operatingExpenses: number
    netProfit: number
  }
}

const PNL_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'section', label: 'Seksi' },
  { key: 'code', label: 'Kode' },
  { key: 'name', label: 'Nama' },
  { key: 'amount', label: 'Jumlah' },
]

function getPeriodRange(period: PeriodType, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  switch (period) {
    case 'month':
      return {
        from: new Date(y, m, 1).toISOString().slice(0, 10),
        to: new Date(y, m + 1, 0).toISOString().slice(0, 10),
      }
    case 'quarter': {
      const q = Math.floor(m / 3)
      return {
        from: new Date(y, q * 3, 1).toISOString().slice(0, 10),
        to: new Date(y, q * 3 + 3, 0).toISOString().slice(0, 10),
      }
    }
    case 'year':
      return {
        from: new Date(y, 0, 1).toISOString().slice(0, 10),
        to: new Date(y, 11, 31).toISOString().slice(0, 10),
      }
    case 'custom':
      return { from: customFrom, to: customTo }
    default:
      return {
        from: new Date(y, m, 1).toISOString().slice(0, 10),
        to: new Date(y, m + 1, 0).toISOString().slice(0, 10),
      }
  }
}

function getPreviousPeriodRange(period: PeriodType, from: string, to: string): { from: string; to: string } {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const diffMs = toDate.getTime() - fromDate.getTime()
  const prevTo = new Date(fromDate.getTime() - 1)
  const prevFrom = new Date(prevTo.getTime() - diffMs)
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  }
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

function PctBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-stone-300">—</span>
  const pos = value >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${pos ? 'text-emerald-600' : 'text-red-500'}`}>
      {pos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {pos ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
}

function LineRow({
  label,
  amount,
  prevAmount,
  currency,
  bold,
  highlight,
  indent,
}: {
  label: string
  amount: number
  prevAmount?: number
  currency: string
  bold?: boolean
  highlight?: 'positive' | 'negative' | 'neutral'
  indent?: boolean
}) {
  const pct = prevAmount !== undefined ? pctChange(amount, prevAmount) : null
  const valueClass =
    highlight === 'positive'
      ? amount >= 0 ? 'text-emerald-600' : 'text-red-500'
      : highlight === 'negative'
      ? 'text-red-500'
      : 'text-stone-800'

  return (
    <div className={`flex items-center justify-between px-5 py-2.5 ${bold ? 'bg-stone-50/80' : 'hover:bg-stone-50/40'} transition-colors`}>
      <span className={`text-sm ${indent ? 'pl-4' : ''} ${bold ? 'font-bold text-stone-700' : 'text-stone-600'}`}>
        {label}
      </span>
      <div className="flex items-center gap-4">
        {pct !== null && <PctBadge value={pct} />}
        {prevAmount !== undefined && (
          <span className="text-xs text-stone-300 font-mono w-28 text-right hidden sm:block">
            {formatCurrency(prevAmount, currency)}
          </span>
        )}
        <span className={`text-sm font-mono w-32 text-right ${bold ? 'font-bold' : ''} ${valueClass}`}>
          {formatCurrency(amount, currency)}
        </span>
      </div>
    </div>
  )
}

const PERIOD_BTNS: { value: PeriodType; label: string }[] = [
  { value: 'month', label: 'Bulan Ini' },
  { value: 'quarter', label: 'Kuartal Ini' },
  { value: 'year', label: 'Tahun Ini' },
  { value: 'custom', label: 'Kustom' },
]

export function PnLClient({ storeId, currency }: PnLClientProps) {
  const [period, setPeriod] = useState<PeriodType>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { from, to } = getPeriodRange(period, customFrom, customTo)
  const { from: prevFrom, to: prevTo } = getPreviousPeriodRange(period, from, to)

  const validRange = period !== 'custom' || (customFrom && customTo)

  const { data, isLoading } = useQuery<PnLData>({
    queryKey: ['pnl', storeId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId, from, to })
      const res = await fetch(`/api/financial-reports/pnl?${params}`)
      if (!res.ok) throw new Error('Failed to fetch P&L')
      return res.json()
    },
    enabled: !!validRange,
  })

  const { data: prevData } = useQuery<PnLData>({
    queryKey: ['pnl', storeId, prevFrom, prevTo],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId, from: prevFrom, to: prevTo })
      const res = await fetch(`/api/financial-reports/pnl?${params}`)
      if (!res.ok) throw new Error('Failed to fetch prev P&L')
      return res.json()
    },
    enabled: !!validRange,
  })

  const t = data?.totals ?? { revenue: 0, cogs: 0, grossProfit: 0, operatingExpenses: 0, netProfit: 0 }
  const pt = prevData?.totals ?? { revenue: 0, cogs: 0, grossProfit: 0, operatingExpenses: 0, netProfit: 0 }

  const grossMargin = t.revenue > 0 ? (t.grossProfit / t.revenue) * 100 : 0
  const netMargin = t.revenue > 0 ? (t.netProfit / t.revenue) * 100 : 0

  const exportRows: Record<string, unknown>[] = [
    ...(data?.revenue ?? []).map(a => ({ section: 'Pendapatan', code: a.code, name: a.name, amount: a.amount })),
    { section: 'TOTAL PENDAPATAN', code: '', name: '', amount: t.revenue },
    ...(data?.cogs ?? []).map(a => ({ section: 'HPP', code: a.code, name: a.name, amount: a.amount })),
    { section: 'LABA KOTOR', code: '', name: '', amount: t.grossProfit },
    ...(data?.operatingExpenses ?? []).map(a => ({ section: 'Biaya Operasional', code: a.code, name: a.name, amount: a.amount })),
    { section: 'LABA BERSIH', code: '', name: '', amount: t.netProfit },
  ]

  const skeleton = () => (
    <div className="space-y-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-10 bg-stone-50 rounded-xl" />
      ))}
    </div>
  )

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Laba Rugi</h1>
        <p className="text-stone-400 text-sm mt-0.5">Profit &amp; Loss — performa keuangan dalam periode tertentu</p>
      </div>

      {/* Controls */}
      <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2">
          {PERIOD_BTNS.map(btn => (
            <button
              key={btn.value}
              onClick={() => setPeriod(btn.value)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                period === btn.value
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                  : 'bg-stone-50 text-stone-500 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
              <span className="text-xs text-stone-400">Dari</span>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="text-sm text-stone-700 bg-transparent focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
              <span className="text-xs text-stone-400">Sampai</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="text-sm text-stone-700 bg-transparent focus:outline-none"
              />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <ExportButton
            type="pdf"
            label="PDF"
            data={exportRows}
            columns={PNL_EXPORT_COLUMNS}
            filename={`laba-rugi-${from}-${to}`}
            title={`Laba Rugi ${from} s/d ${to}`}
            currency={currency}
          />
          <ExportButton
            type="excel"
            label="Excel"
            data={exportRows}
            columns={PNL_EXPORT_COLUMNS}
            filename={`laba-rugi-${from}-${to}`}
            title={`Laba Rugi ${from} s/d ${to}`}
            currency={currency}
          />
        </div>
      </div>

      {/* KPI row */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-stone-400 mb-1">Pendapatan</p>
            <p className="text-lg font-bold text-stone-800">{formatCurrency(t.revenue, currency)}</p>
            <PctBadge value={pctChange(t.revenue, pt.revenue)} />
          </div>
          <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-stone-400 mb-1">Laba Kotor</p>
            <p className="text-lg font-bold text-stone-800">{formatCurrency(t.grossProfit, currency)}</p>
            <span className="text-xs text-stone-400">Margin {grossMargin.toFixed(1)}%</span>
          </div>
          <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-stone-400 mb-1">Biaya Operasional</p>
            <p className="text-lg font-bold text-red-500">-{formatCurrency(t.operatingExpenses, currency)}</p>
            <PctBadge value={pctChange(t.operatingExpenses, pt.operatingExpenses)} />
          </div>
          <div className={`rounded-2xl p-4 shadow-sm border ${t.netProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <p className="text-xs font-semibold text-stone-400 mb-1">Laba Bersih</p>
            <p className={`text-lg font-bold ${t.netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {formatCurrency(t.netProfit, currency)}
            </p>
            <span className="text-xs text-stone-400">Margin {netMargin.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* P&L Statement */}
      {isLoading ? skeleton() : (
        <div className="bg-white border border-stone-100 rounded-2xl shadow-sm overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center justify-between px-5 py-3 bg-stone-50 border-b border-stone-100">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">Akun</span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-stone-300 hidden sm:block w-28 text-right">Periode Lalu</span>
              <span className="text-xs font-bold text-stone-500 w-32 text-right">Periode Ini</span>
            </div>
          </div>

          {/* Revenue */}
          <div className="border-b border-stone-100">
            <div className="px-5 py-2 bg-amber-50/60">
              <span className="text-xs font-bold uppercase tracking-wide text-amber-600">Pendapatan</span>
            </div>
            {(data?.revenue ?? []).map((acc, i) => (
              <LineRow key={i} label={acc.name} amount={acc.amount} currency={currency} indent />
            ))}
            <LineRow label="Total Pendapatan" amount={t.revenue} prevAmount={pt.revenue} currency={currency} bold />
          </div>

          {/* COGS */}
          <div className="border-b border-stone-100">
            <div className="px-5 py-2 bg-stone-50/60">
              <span className="text-xs font-bold uppercase tracking-wide text-stone-500">Harga Pokok Penjualan (HPP)</span>
            </div>
            {(data?.cogs ?? []).map((acc, i) => (
              <LineRow key={i} label={acc.name} amount={acc.amount} currency={currency} indent />
            ))}
            <LineRow label="Total HPP" amount={t.cogs} prevAmount={pt.cogs} currency={currency} bold />
          </div>

          {/* Gross Profit */}
          <div className="border-b-2 border-stone-200">
            <LineRow
              label="Laba Kotor"
              amount={t.grossProfit}
              prevAmount={pt.grossProfit}
              currency={currency}
              bold
              highlight="positive"
            />
          </div>

          {/* OpEx */}
          <div className="border-b border-stone-100">
            <div className="px-5 py-2 bg-stone-50/60">
              <span className="text-xs font-bold uppercase tracking-wide text-stone-500">Biaya Operasional</span>
            </div>
            {(data?.operatingExpenses ?? []).map((acc, i) => (
              <LineRow key={i} label={acc.name} amount={acc.amount} currency={currency} indent />
            ))}
            <LineRow label="Total Biaya Operasional" amount={t.operatingExpenses} prevAmount={pt.operatingExpenses} currency={currency} bold />
          </div>

          {/* Net Profit */}
          <div className={t.netProfit >= 0 ? 'bg-emerald-50/40' : 'bg-red-50/40'}>
            <LineRow
              label="Laba Bersih"
              amount={t.netProfit}
              prevAmount={pt.netProfit}
              currency={currency}
              bold
              highlight="positive"
            />
          </div>
        </div>
      )}
    </div>
  )
}
