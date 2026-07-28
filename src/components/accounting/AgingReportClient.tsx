'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { Clock, TrendingUp, TrendingDown, AlertCircle, RefreshCw } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

interface AgingReportClientProps {
  storeId: string
  currency: string
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgingBucket = 'current' | '31-60' | '61-90' | '91-120' | '120+'

export interface AgingRow {
  id: string
  name: string        // customer name (AR) or vendor name (AP)
  current: number     // 0–30 days
  d31_60: number
  d61_90: number
  d91_120: number
  d120plus: number
  total: number
}

export interface AgingSummary {
  current: number
  d31_60: number
  d61_90: number
  d91_120: number
  d120plus: number
  total: number
}

interface AgingResponse {
  rows: AgingRow[]
  summary: AgingSummary
  asOf: string
}

// ── Nav ───────────────────────────────────────────────────────────────────────

const NAV_TABS = [
  { label: 'Ringkasan', href: '/dashboard/accounting' },
  { label: 'Chart of Accounts', href: '/dashboard/accounting/chart-of-accounts' },
  { label: 'Jurnal', href: '/dashboard/accounting/journal' },
  { label: 'Neraca Saldo', href: '/dashboard/accounting/trial-balance' },
  { label: 'Faktur Supplier', href: '/dashboard/accounting/supplier-invoices' },
  { label: 'Aset Tetap', href: '/dashboard/accounting/fixed-assets' },
  { label: 'Faktur B2B', href: '/dashboard/accounting/invoices' },
  { label: 'Aging Report', href: '/dashboard/accounting/aging-report' },
]

function SubNav() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {NAV_TABS.map(tab => {
        const active = pathname === tab.href
        return (
          <a
            key={tab.href}
            href={tab.href}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-2)] hover:bg-[var(--bg-card)] hover:text-[var(--text-1)]'
            )}
          >
            {tab.label}
          </a>
        )
      })}
    </div>
  )
}

// ── Bucket header labels ──────────────────────────────────────────────────────

const BUCKET_HEADERS = [
  { key: 'current', label: 'Lancar (0–30)', colorClass: 'text-emerald-600' },
  { key: 'd31_60',  label: '31–60 hari',   colorClass: 'text-yellow-600' },
  { key: 'd61_90',  label: '61–90 hari',   colorClass: 'text-orange-500' },
  { key: 'd91_120', label: '91–120 hari',  colorClass: 'text-red-500' },
  { key: 'd120plus',label: '>120 hari',    colorClass: 'text-red-700' },
] as const

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ summary, currency }: { summary: AgingSummary; currency: string }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {BUCKET_HEADERS.map(b => (
        <div key={b.key} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3">
          <p className={cn('text-xs font-medium mb-1', b.colorClass)}>{b.label}</p>
          <p className="text-lg font-bold text-[var(--text-1)]">
            {formatCurrency(summary[b.key as keyof AgingSummary], currency)}
          </p>
        </div>
      ))}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3">
        <p className="text-xs font-medium mb-1 text-[var(--text-2)]">Total</p>
        <p className="text-lg font-bold text-[var(--text-1)]">
          {formatCurrency(summary.total, currency)}
        </p>
      </div>
    </div>
  )
}

// ── Aging table ───────────────────────────────────────────────────────────────

function AgingTable({ rows, summary, currency, emptyMsg }: {
  rows: AgingRow[]
  summary: AgingSummary
  currency: string
  emptyMsg: string
}) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[var(--bg-subtle)]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-2)]">Nama</th>
              {BUCKET_HEADERS.map(b => (
                <th key={b.key} className={cn('px-4 py-3 text-right text-xs font-semibold', b.colorClass)}>
                  {b.label}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-2)]">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--text-3)]">
                  {emptyMsg}
                </td>
              </tr>
            ) : (
              <>
                {rows.map(row => (
                  <tr key={row.id} className="border-t border-[var(--border)] hover:bg-[var(--bg-subtle)]">
                    <td className="px-4 py-3 text-sm font-medium text-[var(--text-1)]">{row.name}</td>
                    <td className="px-4 py-3 text-sm text-right text-emerald-600">
                      {row.current > 0 ? formatCurrency(row.current, currency) : '–'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-yellow-600">
                      {row.d31_60 > 0 ? formatCurrency(row.d31_60, currency) : '–'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-orange-500">
                      {row.d61_90 > 0 ? formatCurrency(row.d61_90, currency) : '–'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-red-500">
                      {row.d91_120 > 0 ? formatCurrency(row.d91_120, currency) : '–'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-red-700">
                      {row.d120plus > 0 ? formatCurrency(row.d120plus, currency) : '–'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-[var(--text-1)]">
                      {formatCurrency(row.total, currency)}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 border-[var(--border)] bg-[var(--bg-subtle)] font-semibold">
                  <td className="px-4 py-3 text-sm text-[var(--text-1)]">Total</td>
                  <td className="px-4 py-3 text-sm text-right text-emerald-600">{formatCurrency(summary.current, currency)}</td>
                  <td className="px-4 py-3 text-sm text-right text-yellow-600">{formatCurrency(summary.d31_60, currency)}</td>
                  <td className="px-4 py-3 text-sm text-right text-orange-500">{formatCurrency(summary.d61_90, currency)}</td>
                  <td className="px-4 py-3 text-sm text-right text-red-500">{formatCurrency(summary.d91_120, currency)}</td>
                  <td className="px-4 py-3 text-sm text-right text-red-700">{formatCurrency(summary.d120plus, currency)}</td>
                  <td className="px-4 py-3 text-sm text-right text-[var(--text-1)]">{formatCurrency(summary.total, currency)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgingReportClient({ storeId, currency }: AgingReportClientProps) {
  const [tab, setTab] = useState<'ar' | 'ap'>('ar')

  const { data: arData, isLoading: arLoading, refetch: refetchAr } = useQuery<AgingResponse>({
    queryKey: ['aging-ar', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/aging-report/ar?storeId=${storeId}`)
      if (!res.ok) throw new Error('Gagal memuat data AR')
      return (await res.json()) as AgingResponse
    },
    enabled: tab === 'ar',
  })

  const { data: apData, isLoading: apLoading, refetch: refetchAp } = useQuery<AgingResponse>({
    queryKey: ['aging-ap', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/aging-report/ap?storeId=${storeId}`)
      if (!res.ok) throw new Error('Gagal memuat data AP')
      return (await res.json()) as AgingResponse
    },
    enabled: tab === 'ap',
  })

  const isLoading = tab === 'ar' ? arLoading : apLoading
  const data = tab === 'ar' ? arData : apData
  const refetch = tab === 'ar' ? refetchAr : refetchAp

  const EMPTY_SUMMARY: AgingSummary = { current: 0, d31_60: 0, d61_90: 0, d91_120: 0, d120plus: 0, total: 0 }

  return (
    <div className="space-y-4">
      <SubNav />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)]">Aging Report</h1>
          <p className="text-sm text-[var(--text-2)] mt-0.5">
            Analisis piutang dan utang berdasarkan umur keterlambatan
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* AR / AP tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('ar')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
            tab === 'ar'
              ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
              : 'bg-[var(--bg-card)] text-[var(--text-2)] border-[var(--border)] hover:text-[var(--text-1)]'
          )}
        >
          <TrendingUp className="h-4 w-4" />
          Piutang (AR)
        </button>
        <button
          onClick={() => setTab('ap')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
            tab === 'ap'
              ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
              : 'bg-[var(--bg-card)] text-[var(--text-2)] border-[var(--border)] hover:text-[var(--text-1)]'
          )}
        >
          <TrendingDown className="h-4 w-4" />
          Utang (AP)
        </button>
      </div>

      {/* As-of date */}
      {data?.asOf && (
        <p className="text-xs text-[var(--text-3)] flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Per tanggal: {new Date(data.asOf).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-[var(--text-3)]">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          Memuat data...
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary cards */}
          <SummaryCards summary={data?.summary ?? EMPTY_SUMMARY} currency={currency} />

          {/* Overdue alert */}
          {data && (data.summary.d61_90 + data.summary.d91_120 + data.summary.d120plus) > 0 && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-sm">
                Terdapat {formatCurrency(data.summary.d61_90 + data.summary.d91_120 + data.summary.d120plus, currency)} yang telah lewat jatuh tempo lebih dari 60 hari.
              </p>
            </div>
          )}

          {/* Table */}
          <AgingTable
            rows={data?.rows ?? []}
            summary={data?.summary ?? EMPTY_SUMMARY}
            currency={currency}
            emptyMsg={
              tab === 'ar'
                ? 'Tidak ada piutang outstanding'
                : 'Tidak ada utang outstanding'
            }
          />
        </div>
      )}
    </div>
  )
}
