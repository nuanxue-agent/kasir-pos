'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, AlertTriangle, RefreshCw,
  ChevronDown, ChevronUp, BarChart3, DollarSign, Droplets
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { formatCurrency, cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

const AreaChart      = dynamic(() => import('recharts').then(m => m.AreaChart),      { ssr: false })
const Area           = dynamic(() => import('recharts').then(m => m.Area),           { ssr: false })
const XAxis          = dynamic(() => import('recharts').then(m => m.XAxis),          { ssr: false })
const YAxis          = dynamic(() => import('recharts').then(m => m.YAxis),          { ssr: false })
const CartesianGrid  = dynamic(() => import('recharts').then(m => m.CartesianGrid),  { ssr: false })
const Tooltip        = dynamic(() => import('recharts').then(m => m.Tooltip),        { ssr: false })
const Legend         = dynamic(() => import('recharts').then(m => m.Legend),         { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

// ── Types ────────────────────────────────────────────────────────────────────

interface ForecastRow {
  id: string
  storeId: string
  date: string
  projectedInflow: number
  projectedOutflow: number
  projectedBalance: number
  actualInflow: number
  actualOutflow: number
  actualBalance: number
  notes: string
}

type Scenario = 'best' | 'base' | 'worst'
type Horizon  = 30 | 60 | 90

interface CashFlowForecastClientProps {
  storeId: string
  currency: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}

const SCENARIO_LABELS: Record<Scenario, string> = {
  best:  'Optimis',
  base:  'Normal',
  worst: 'Pesimis',
}

const SCENARIO_COLORS: Record<Scenario, string> = {
  best:  'text-emerald-500',
  base:  'text-blue-500',
  worst: 'text-red-500',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CashFlowForecastClient({ storeId, currency }: CashFlowForecastClientProps) {
  const qc = useQueryClient()

  const [horizon, setHorizon]     = useState<Horizon>(30)
  const [scenario, setScenario]   = useState<Scenario>('base')
  const [threshold, setThreshold] = useState(0)
  const [opening, setOpening]     = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const { data: rows = [], isLoading, refetch } = useQuery<ForecastRow[]>({
    queryKey: ['cash-flow-forecast', storeId, horizon],
    queryFn: async () => {
      const res = await fetch(`/api/cash-flow-forecast?storeId=${storeId}&days=${horizon}`)
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json as ForecastRow[]
    },
  })

  // ── Generate ───────────────────────────────────────────────────────────────

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/cash-flow-forecast/generate?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days: horizon,
          openingBalance: opening,
          liquidityThreshold: threshold,
          scenario,
        }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: (data) => {
      toast.success(`Prakiraan dibuat: ${data.generated} hari`)
      qc.invalidateQueries({ queryKey: ['cash-flow-forecast', storeId] })
    },
    onError: (e: any) => toast.error(e.message ?? 'Gagal membuat prakiraan'),
  })

  // ── Update actuals ─────────────────────────────────────────────────────────

  const updateActuals = useMutation({
    mutationFn: async ({ id, actualInflow, actualOutflow }: {
      id: string; actualInflow: number; actualOutflow: number
    }) => {
      const actualBalance = actualInflow - actualOutflow
      const res = await fetch(`/api/cash-flow-forecast/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualInflow, actualOutflow, actualBalance }),
      })
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json
    },
    onSuccess: () => {
      toast.success('Aktual diperbarui')
      qc.invalidateQueries({ queryKey: ['cash-flow-forecast', storeId] })
    },
    onError: (e: any) => toast.error(e.message ?? 'Gagal memperbarui aktual'),
  })

  // ── Derived ────────────────────────────────────────────────────────────────

  const warnings = useMemo(
    () => rows.filter(r => r.notes?.includes('LIQUIDITY_WARNING') || r.projectedBalance < threshold),
    [rows, threshold]
  )

  const totalProjectedInflow  = rows.reduce((s, r) => s + r.projectedInflow, 0)
  const totalProjectedOutflow = rows.reduce((s, r) => s + r.projectedOutflow, 0)
  const netCashFlow           = totalProjectedInflow - totalProjectedOutflow
  const minBalance            = rows.length ? Math.min(...rows.map(r => r.projectedBalance)) : 0

  const chartData = rows.slice(0, horizon).map(r => ({
    date:    fmtDate(r.date),
    Masuk:   Math.round(r.projectedInflow),
    Keluar:  Math.round(r.projectedOutflow),
    Saldo:   Math.round(r.projectedBalance),
  }))

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
            Prakiraan Arus Kas
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            Proyeksi likuiditas dan perencanaan skenario
          </p>
        </div>
        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--primary)' }}
        >
          <RefreshCw size={15} className={generate.isPending ? 'animate-spin' : ''} />
          Buat Prakiraan
        </button>
      </div>

      {/* Controls */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {/* Horizon */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>
            Horizon
          </label>
          <div className="flex gap-1">
            {([30, 60, 90] as Horizon[]).map(h => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={cn(
                  'flex-1 py-1 rounded text-xs font-medium transition-colors',
                  horizon === h
                    ? 'text-white'
                    : 'hover:opacity-80'
                )}
                style={
                  horizon === h
                    ? { background: 'var(--primary)', color: '#fff' }
                    : { background: 'var(--bg-2)', color: 'var(--text-2)' }
                }
              >
                {h}H
              </button>
            ))}
          </div>
        </div>

        {/* Scenario */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>
            Skenario
          </label>
          <select
            value={scenario}
            onChange={e => setScenario(e.target.value as Scenario)}
            className="w-full text-xs rounded-lg px-2 py-1.5 border"
            style={{ background: 'var(--bg-2)', color: 'var(--text-1)', borderColor: 'var(--border)' }}
          >
            {(Object.keys(SCENARIO_LABELS) as Scenario[]).map(s => (
              <option key={s} value={s}>{SCENARIO_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {/* Opening balance */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>
            Saldo Awal (Rp)
          </label>
          <input
            type="number"
            value={opening}
            onChange={e => setOpening(Number(e.target.value))}
            className="w-full text-xs rounded-lg px-2 py-1.5 border"
            style={{ background: 'var(--bg-2)', color: 'var(--text-1)', borderColor: 'var(--border)' }}
          />
        </div>

        {/* Threshold */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>
            Batas Likuiditas (Rp)
          </label>
          <input
            type="number"
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="w-full text-xs rounded-lg px-2 py-1.5 border"
            style={{ background: 'var(--bg-2)', color: 'var(--text-1)', borderColor: 'var(--border)' }}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Masuk',
            value: formatCurrency(totalProjectedInflow, currency),
            icon: TrendingUp,
            color: 'text-emerald-500',
          },
          {
            label: 'Total Keluar',
            value: formatCurrency(totalProjectedOutflow, currency),
            icon: TrendingDown,
            color: 'text-red-500',
          },
          {
            label: 'Arus Kas Bersih',
            value: formatCurrency(netCashFlow, currency),
            icon: BarChart3,
            color: netCashFlow >= 0 ? 'text-emerald-500' : 'text-red-500',
          },
          {
            label: 'Saldo Minimum',
            value: formatCurrency(minBalance, currency),
            icon: Droplets,
            color: minBalance < threshold ? 'text-amber-500' : 'text-blue-500',
          },
        ].map(card => (
          <div
            key={card.label}
            className="p-4 rounded-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>{card.label}</p>
              <card.icon size={16} className={card.color} />
            </div>
            <p className={cn('text-lg font-bold', card.color)}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Liquidity warnings */}
      {warnings.length > 0 && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl"
          style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}
        >
          <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-600">
              {warnings.length} hari berpotensi defisit likuiditas
            </p>
            <p className="text-xs text-amber-500 mt-1">
              {warnings.slice(0, 5).map(w => fmtDate(w.date)).join(', ')}
              {warnings.length > 5 && ` +${warnings.length - 5} lainnya`}
            </p>
          </div>
        </div>
      )}

      {/* Scenario planning cards */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-2)' }}>
          Perencanaan Skenario
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {(Object.keys(SCENARIO_LABELS) as Scenario[]).map(sc => {
            const factor = sc === 'best' ? 1.2 : sc === 'worst' ? 0.8 : 1.0
            const inflowEst  = totalProjectedInflow  * (sc === 'best' ? 1.2 : sc === 'worst' ? 0.8 : 1.0)
            const outflowEst = totalProjectedOutflow * (sc === 'best' ? 0.8 : sc === 'worst' ? 1.2 : 1.0)
            const net = inflowEst - outflowEst
            void factor
            return (
              <div
                key={sc}
                onClick={() => setScenario(sc)}
                className={cn(
                  'p-4 rounded-xl cursor-pointer transition-all',
                  scenario === sc ? 'ring-2' : 'hover:opacity-80'
                )}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  ...(scenario === sc ? { ringColor: 'var(--primary)' } : {}),
                }}
              >
                <p className={cn('text-xs font-semibold mb-2', SCENARIO_COLORS[sc])}>
                  {SCENARIO_LABELS[sc]}
                </p>
                <p className="text-base font-bold" style={{ color: 'var(--text-1)' }}>
                  {formatCurrency(net, currency)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  Arus bersih {horizon} hari
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div
          className="p-4 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-2)' }}>
            Grafik Arus Kas — {SCENARIO_LABELS[scenario]}
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="colorMasuk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorKeluar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-3)' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-2)', fontSize: 11 }}
                formatter={(v: any) => formatCurrency(v, currency)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="Masuk"  stroke="#10b981" fill="url(#colorMasuk)"  strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Keluar" stroke="#ef4444" fill="url(#colorKeluar)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Saldo"  stroke="#3b82f6" fill="url(#colorSaldo)"  strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--bg-2)' }}>
              {['Tanggal', 'Masuk (Proyeksi)', 'Keluar (Proyeksi)', 'Saldo (Proyeksi)', 'Aktual Masuk', 'Aktual Keluar', 'Status', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-sm" style={{ color: 'var(--text-3)' }}>
                  Memuat…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-sm" style={{ color: 'var(--text-3)' }}>
                  Belum ada data. Klik &ldquo;Buat Prakiraan&rdquo; untuk memulai.
                </td>
              </tr>
            ) : (
              rows.map(row => {
                const warning = row.projectedBalance < threshold
                const isOpen  = expandedId === row.id
                return (
                  <>
                    <tr
                      key={row.id}
                      className={cn(
                        'border-t transition-colors',
                        warning ? 'bg-amber-50/10' : 'hover:bg-[var(--bg-2)]'
                      )}
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <td className="px-3 py-2 font-medium text-xs" style={{ color: 'var(--text-1)' }}>
                        {fmtDate(row.date)}
                      </td>
                      <td className="px-3 py-2 text-xs text-emerald-500">
                        {formatCurrency(row.projectedInflow, currency)}
                      </td>
                      <td className="px-3 py-2 text-xs text-red-500">
                        {formatCurrency(row.projectedOutflow, currency)}
                      </td>
                      <td className={cn('px-3 py-2 text-xs font-medium', row.projectedBalance < 0 ? 'text-red-500' : 'text-blue-500')}>
                        {formatCurrency(row.projectedBalance, currency)}
                      </td>
                      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-2)' }}>
                        {row.actualInflow ? formatCurrency(row.actualInflow, currency) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-2)' }}>
                        {row.actualOutflow ? formatCurrency(row.actualOutflow, currency) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {warning && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-100/20 px-1.5 py-0.5 rounded-full">
                            <AlertTriangle size={10} /> Rendah
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setExpandedId(isOpen ? null : row.id)}
                          className="text-xs"
                          style={{ color: 'var(--text-3)' }}
                        >
                          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${row.id}-expand`} style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
                        <td colSpan={8} className="px-4 py-3">
                          <ActualForm
                            row={row}
                            currency={currency}
                            onSave={(ai, ao) => updateActuals.mutate({ id: row.id, actualInflow: ai, actualOutflow: ao })}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Inline actual-entry sub-form ────────────────────────────────────────────

function ActualForm({
  row,
  currency,
  onSave,
}: {
  row: ForecastRow
  currency: string
  onSave: (inflow: number, outflow: number) => void
}) {
  const [ai, setAi] = useState(row.actualInflow)
  const [ao, setAo] = useState(row.actualOutflow)

  const variance = (ai - row.projectedInflow) - (ao - row.projectedOutflow)

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-3)' }}>
          Aktual Masuk
        </label>
        <input
          type="number"
          value={ai}
          onChange={e => setAi(Number(e.target.value))}
          className="w-36 text-xs rounded px-2 py-1 border"
          style={{ background: 'var(--bg-card)', color: 'var(--text-1)', borderColor: 'var(--border)' }}
        />
      </div>
      <div>
        <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-3)' }}>
          Aktual Keluar
        </label>
        <input
          type="number"
          value={ao}
          onChange={e => setAo(Number(e.target.value))}
          className="w-36 text-xs rounded px-2 py-1 border"
          style={{ background: 'var(--bg-card)', color: 'var(--text-1)', borderColor: 'var(--border)' }}
        />
      </div>
      <div className="text-xs" style={{ color: 'var(--text-3)' }}>
        Varians:{' '}
        <span className={variance >= 0 ? 'text-emerald-500' : 'text-red-500'}>
          {formatCurrency(variance, currency)}
        </span>
      </div>
      <button
        onClick={() => onSave(ai, ao)}
        className="px-3 py-1 rounded text-xs font-medium text-white"
        style={{ background: 'var(--primary)' }}
      >
        Simpan
      </button>
    </div>
  )
}
