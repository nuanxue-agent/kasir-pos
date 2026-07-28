'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/utils'
import { exportToCSV } from '@/lib/export'
import {
  FileSpreadsheet,
  Receipt,
  TrendingUp,
  DollarSign,
  BarChart2,
  FileText,
  Download,
  ChevronDown,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryBreakdown {
  category: string
  taxable: number
  tax: number
}

interface TaxPeriodRow {
  period: string
  grossRevenue: number
  taxableRevenue: number
  taxCollected: number
  pphBase: number
  pphCollected: number
  orderCount: number
  ppnRate: number
  categoryBreakdown: CategoryBreakdown[]
}

interface TaxReportResponse {
  data: TaxPeriodRow[]
  ppnRate: number
  ppnEnabled: boolean
  ppnIncluded: boolean
}

interface TaxReportClientProps {
  storeId: string
  currency: string
}

// ─── e-Faktur helpers ─────────────────────────────────────────────────────────

export interface EFakturRow {
  jenisFaktur: 'FK' | 'FT'
  nomorFaktur: string
  tanggalFaktur: string
  npwpLawan: string
  namaPembeli: string
  dpp: number
  ppn: number
  ppnbm: number
}

export function generateEFakturRows(
  rows: TaxPeriodRow[],
  storeNpwp = '000000000000000',
): EFakturRow[] {
  return rows.map((r, i) => ({
    jenisFaktur: 'FK' as const,
    nomorFaktur: `010.000-${new Date().getFullYear()}.${String(i + 1).padStart(8, '0')}`,
    tanggalFaktur: r.period.length === 7
      ? `01/${r.period.slice(5, 7)}/${r.period.slice(0, 4)}`
      : r.period,
    npwpLawan: storeNpwp,
    namaPembeli: 'BERBAGAI PEMBELI',
    dpp: Math.round(r.taxableRevenue),
    ppn: Math.round(r.taxCollected),
    ppnbm: 0,
  }))
}

// ─── Pure tax calculation functions (exported for tests) ──────────────────────

export function calcPpnExclusive(dpp: number, rate: number): number {
  return Math.round(dpp * rate)
}

export function calcPpnInclusive(grossAmount: number, rate: number): { dpp: number; ppn: number } {
  const dpp = grossAmount / (1 + rate)
  const ppn = grossAmount - dpp
  return { dpp: Math.round(dpp), ppn: Math.round(ppn) }
}

export function calcPph23(dpp: number, threshold: number, rate: number): number {
  if (dpp < threshold) return 0
  return Math.round(dpp * rate)
}

export function isPph23Applicable(
  grossAmount: number,
  customerType: string,
  threshold = 500_000,
): boolean {
  return customerType === 'business' && grossAmount >= threshold
}

export function groupByPeriod(
  items: Array<{ date: string; amount: number }>,
  groupBy: 'month' | 'quarter' | 'year',
): Map<string, number> {
  const result = new Map<string, number>()
  for (const item of items) {
    const d = new Date(item.date)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    let key: string
    if (groupBy === 'year') key = `${y}`
    else if (groupBy === 'quarter') key = `${y}-Q${Math.ceil(m / 3)}`
    else key = `${y}-${String(m).padStart(2, '0')}`
    result.set(key, (result.get(key) ?? 0) + item.amount)
  }
  return result
}

export function aggregateTaxSummary(rows: TaxPeriodRow[]): {
  totalGross: number
  totalTaxable: number
  totalPpn: number
  totalPphBase: number
  totalPph: number
  totalOrders: number
} {
  return rows.reduce(
    (acc, r) => ({
      totalGross: acc.totalGross + r.grossRevenue,
      totalTaxable: acc.totalTaxable + r.taxableRevenue,
      totalPpn: acc.totalPpn + r.taxCollected,
      totalPphBase: acc.totalPphBase + r.pphBase,
      totalPph: acc.totalPph + r.pphCollected,
      totalOrders: acc.totalOrders + r.orderCount,
    }),
    { totalGross: 0, totalTaxable: 0, totalPpn: 0, totalPphBase: 0, totalPph: 0, totalOrders: 0 },
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

type Period = 'monthly' | 'quarterly' | 'yearly'
type GroupBy = 'month' | 'quarter' | 'year'

const PERIOD_OPTIONS: Array<{ label: string; value: Period; groupBy: GroupBy }> = [
  { label: 'Bulanan', value: 'monthly', groupBy: 'month' },
  { label: 'Kuartalan', value: 'quarterly', groupBy: 'quarter' },
  { label: 'Tahunan', value: 'yearly', groupBy: 'year' },
]

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

const QUARTER_LABELS: Record<string, string> = {
  Q1: 'Kuartal 1 (Jan–Mar)',
  Q2: 'Kuartal 2 (Apr–Jun)',
  Q3: 'Kuartal 3 (Jul–Sep)',
  Q4: 'Kuartal 4 (Okt–Des)',
}

function periodLabel(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) {
    const m = parseInt(period.slice(5), 10)
    return `${MONTH_NAMES[m - 1]} ${period.slice(0, 4)}`
  }
  if (/^\d{4}-Q\d$/.test(period)) {
    const q = period.slice(5)
    return `${QUARTER_LABELS[q] ?? q} ${period.slice(0, 4)}`
  }
  return period
}

function buildDateRange(
  year: number,
  period: Period,
  quarter?: number,
  month?: number,
): { from: string; to: string } {
  if (period === 'yearly') return { from: `${year}-01-01`, to: `${year}-12-31` }
  if (period === 'quarterly' && quarter) {
    const startMonth = (quarter - 1) * 3 + 1
    const endMonth = startMonth + 2
    const lastDay = new Date(year, endMonth, 0).getDate()
    return {
      from: `${year}-${String(startMonth).padStart(2, '0')}-01`,
      to: `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`,
    }
  }
  if (period === 'monthly' && month) {
    const lastDay = new Date(year, month, 0).getDate()
    return {
      from: `${year}-${String(month).padStart(2, '0')}-01`,
      to: `${year}-${String(month).padStart(2, '0')}-${lastDay}`,
    }
  }
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TaxReportClient({ storeId, currency }: TaxReportClientProps) {
  const [period, setPeriod] = useState<Period>('monthly')
  const [year, setYear] = useState(CURRENT_YEAR)
  const [quarter, setQuarter] = useState(Math.ceil(CURRENT_MONTH / 3))
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null)

  const groupBy = PERIOD_OPTIONS.find(p => p.value === period)?.groupBy ?? 'month'
  const { from, to } = buildDateRange(year, period, quarter, month)

  const { data: resp, isLoading } = useQuery<TaxReportResponse>({
    queryKey: ['tax-report', storeId, from, to, groupBy],
    queryFn: async () => {
      const res = await fetch(
        `/api/reports/tax?storeId=${storeId}&from=${from}&to=${to}&groupBy=${groupBy}`,
      )
      if (!res.ok) throw new Error('Gagal memuat laporan pajak')
      return res.json()
    },
  })

  const rows: TaxPeriodRow[] = resp?.data ?? []
  const summary = aggregateTaxSummary(rows)

  function handleExportCsv() {
    const exportRows = rows.map(r => ({
      periode: periodLabel(r.period),
      pesanan: r.orderCount,
      omzetBruto: r.grossRevenue,
      dpp: r.taxableRevenue,
      ppn: r.taxCollected,
      pphDasar: r.pphBase,
      pph23: r.pphCollected,
    }))
    exportToCSV(exportRows, `laporan-pajak-${from}-${to}`, [
      'periode', 'pesanan', 'omzetBruto', 'dpp', 'ppn', 'pphDasar', 'pph23',
    ])
  }

  function handleExportEFaktur() {
    const efRows = generateEFakturRows(rows)
    const csvLines = [
      'FK,FT,NomorFaktur,TanggalFaktur,NPWPLawanTransaksi,NamaPembeli,DPP,PPN,PPnBM',
      ...efRows.map(r =>
        [
          r.jenisFaktur === 'FK' ? '1' : '2',
          '',
          r.nomorFaktur,
          r.tanggalFaktur,
          r.npwpLawan,
          r.namaPembeli,
          r.dpp,
          r.ppn,
          r.ppnbm,
        ].join(','),
      ),
    ]
    const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `efaktur-${from}-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Laporan Pajak PPN & PPh</h1>
        <p className="mt-0.5 text-sm text-[var(--text-3)]">
          Ringkasan pajak PPN dan PPh 23 — per periode, kategori produk, dan ekspor e-Faktur
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        {/* Period type selector */}
        <div className="flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]">
          {PERIOD_OPTIONS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors
                ${period === p.value
                  ? 'bg-amber-500 text-white'
                  : 'text-[var(--text-2)] hover:bg-[var(--bg-muted)]'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Year */}
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5">
          <span className="text-xs font-semibold text-[var(--text-3)]">Tahun</span>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="bg-transparent text-xs text-[var(--text-1)] focus:outline-none"
            aria-label="Pilih tahun"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Quarter */}
        {period === 'quarterly' && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5">
            <span className="text-xs font-semibold text-[var(--text-3)]">Kuartal</span>
            <select
              value={quarter}
              onChange={e => setQuarter(Number(e.target.value))}
              className="bg-transparent text-xs text-[var(--text-1)] focus:outline-none"
              aria-label="Pilih kuartal"
            >
              {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </div>
        )}

        {/* Month */}
        {period === 'monthly' && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5">
            <span className="text-xs font-semibold text-[var(--text-3)]">Bulan</span>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="bg-transparent text-xs text-[var(--text-1)] focus:outline-none"
              aria-label="Pilih bulan"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Export buttons */}
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleExportCsv}
            disabled={isLoading || rows.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-2)] transition-colors hover:bg-[var(--bg-muted)] disabled:opacity-40"
            aria-label="Ekspor CSV"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            onClick={handleExportEFaktur}
            disabled={isLoading || rows.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-40"
            aria-label="Ekspor e-Faktur DJP"
          >
            <Receipt className="h-3.5 w-3.5" />
            e-Faktur
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {!isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Omzet Bruto', value: formatCurrency(summary.totalGross, currency), icon: DollarSign, cls: 'border-[var(--border)] bg-[var(--bg-card)]', textCls: 'text-[var(--text-1)]' },
            { label: 'DPP', value: formatCurrency(summary.totalTaxable, currency), icon: TrendingUp, cls: 'border-[var(--border)] bg-[var(--bg-card)]', textCls: 'text-[var(--text-1)]' },
            { label: 'PPN Dipungut', value: formatCurrency(summary.totalPpn, currency), icon: Receipt, cls: 'border-amber-100 bg-amber-50', textCls: 'text-amber-600' },
            { label: 'Dasar PPh 23', value: formatCurrency(summary.totalPphBase, currency), icon: BarChart2, cls: 'border-[var(--border)] bg-[var(--bg-card)]', textCls: 'text-[var(--text-1)]' },
            { label: 'PPh 23 Dipotong', value: formatCurrency(summary.totalPph, currency), icon: Download, cls: 'border-blue-100 bg-blue-50', textCls: 'text-blue-600' },
            { label: 'Total Pesanan', value: summary.totalOrders.toLocaleString('id-ID'), icon: FileText, cls: 'border-[var(--border)] bg-[var(--bg-card)]', textCls: 'text-[var(--text-1)]' },
          ].map(card => (
            <div key={card.label} className={`rounded-xl border p-3 shadow-sm ${card.cls}`}>
              <div className="mb-1 flex items-center gap-1.5">
                <card.icon className={`h-3.5 w-3.5 ${card.textCls}`} />
                <p className="text-[10px] font-semibold text-[var(--text-3)] leading-tight">{card.label}</p>
              </div>
              <p className={`text-sm font-bold ${card.textCls}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Main table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        <div className="border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-sm font-bold text-[var(--text-1)]">Rincian Per Periode</h2>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">
            {resp?.ppnEnabled
              ? `Tarif PPN: ${((resp.ppnRate ?? 0.11) * 100).toFixed(0)}% — ${resp.ppnIncluded ? 'Inklusif' : 'Eksklusif'}`
              : 'PPN tidak diaktifkan'}
            {' '}| PPh 23: 2% untuk B2B ≥ Rp 500.000
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--text-3)]">
            Tidak ada data transaksi untuk periode ini
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-subtle)]">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-3)]">Periode</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--text-3)]">Pesanan</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--text-3)]">Omzet Bruto</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--text-3)]">DPP</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-amber-600">PPN</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-blue-600">PPh 23</th>
                  <th className="w-8 px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map(r => (
                  <>
                    <tr
                      key={r.period}
                      className="cursor-pointer hover:bg-[var(--bg-subtle)]/50"
                      onClick={() => setExpandedPeriod(expandedPeriod === r.period ? null : r.period)}
                    >
                      <td className="px-5 py-2.5 font-medium text-[var(--text-1)]">{periodLabel(r.period)}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-[var(--text-2)]">{r.orderCount}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-[var(--text-1)]">
                        {formatCurrency(r.grossRevenue, currency)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-[var(--text-2)]">
                        {formatCurrency(r.taxableRevenue, currency)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono font-semibold text-amber-600">
                        {formatCurrency(r.taxCollected, currency)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono font-semibold text-blue-600">
                        {r.pphCollected > 0 ? formatCurrency(r.pphCollected, currency) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {r.categoryBreakdown.length > 0 && (
                          <ChevronDown
                            className={`h-4 w-4 text-[var(--text-3)] transition-transform
                              ${expandedPeriod === r.period ? 'rotate-180' : ''}`}
                          />
                        )}
                      </td>
                    </tr>
                    {expandedPeriod === r.period && r.categoryBreakdown.length > 0 && (
                      <tr key={`${r.period}-cat`}>
                        <td colSpan={7} className="bg-[var(--bg-subtle)]/60 px-8 py-3">
                          <p className="mb-2 text-xs font-bold text-[var(--text-3)]">Rincian per Kategori Produk</p>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[var(--text-3)]">
                                <th className="pb-1 pr-4 text-left font-semibold">Kategori</th>
                                <th className="pb-1 pr-4 text-right font-semibold">DPP</th>
                                <th className="pb-1 text-right font-semibold text-amber-600">PPN</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                              {r.categoryBreakdown.map(cb => (
                                <tr key={cb.category}>
                                  <td className="py-1 pr-4 text-[var(--text-1)]">{cb.category}</td>
                                  <td className="py-1 pr-4 text-right font-mono text-[var(--text-2)]">
                                    {formatCurrency(cb.taxable, currency)}
                                  </td>
                                  <td className="py-1 text-right font-mono font-semibold text-amber-600">
                                    {formatCurrency(cb.tax, currency)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
              {rows.length > 1 && (
                <tfoot className="border-t-2 border-[var(--border)] bg-[var(--bg-subtle)]">
                  <tr>
                    <td className="px-5 py-3 text-sm font-bold text-[var(--text-1)]">TOTAL</td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-[var(--text-1)]">{summary.totalOrders}</td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-[var(--text-1)]">
                      {formatCurrency(summary.totalGross, currency)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-[var(--text-1)]">
                      {formatCurrency(summary.totalTaxable, currency)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-amber-600">
                      {formatCurrency(summary.totalPpn, currency)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-blue-600">
                      {summary.totalPph > 0 ? formatCurrency(summary.totalPph, currency) : '—'}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-4 space-y-1 text-xs text-[var(--text-3)]">
        <p><strong>DPP</strong> (Dasar Pengenaan Pajak): Harga jual sebelum PPN. Inklusif: DPP = Bruto × 100/111. Eksklusif: DPP = subtotal setelah diskon.</p>
        <p><strong>PPN</strong>: Pajak Pertambahan Nilai sesuai UU No. 7 Tahun 2021 (HPP), tarif 11% berlaku per 1 April 2022.</p>
        <p><strong>PPh 23</strong>: Pajak Penghasilan Pasal 23 sebesar 2% atas jasa untuk transaksi B2B ≥ Rp 500.000.</p>
        <p><strong>e-Faktur</strong>: Format CSV mengacu pada format e-Faktur DJP untuk pelaporan SPT Masa PPN. Sesuaikan NSFP dengan yang diterbitkan DJP.</p>
      </div>
    </div>
  )
}
