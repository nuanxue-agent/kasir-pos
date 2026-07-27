'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/utils'
import { exportToPDF, exportToCSV } from '@/lib/export'
import { FileText, Download, FileSpreadsheet } from 'lucide-react'

const TAX_RATE = 0.11 // 11% PPN

interface TaxMonthRow {
  month: number
  grossRevenue: number
  taxableRevenue: number
  taxCollected: number
  orderCount: number
}

interface TaxReportClientProps {
  storeId: string
  currency: string
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

const QUARTERS = [
  { label: 'Q1', months: [1, 2, 3] },
  { label: 'Q2', months: [4, 5, 6] },
  { label: 'Q3', months: [7, 8, 9] },
  { label: 'Q4', months: [10, 11, 12] },
]

function sumRows(rows: TaxMonthRow[]) {
  return rows.reduce(
    (acc, r) => ({
      grossRevenue: acc.grossRevenue + r.grossRevenue,
      taxableRevenue: acc.taxableRevenue + r.taxableRevenue,
      taxCollected: acc.taxCollected + r.taxCollected,
      orderCount: acc.orderCount + r.orderCount,
    }),
    { grossRevenue: 0, taxableRevenue: 0, taxCollected: 0, orderCount: 0 },
  )
}

const EXPORT_COLUMNS = [
  { key: 'month', label: 'Bulan' },
  { key: 'orderCount', label: 'Jml Pesanan' },
  { key: 'grossRevenue', label: 'Omzet Bruto' },
  { key: 'taxableRevenue', label: 'DPP (Dasar Pengenaan Pajak)' },
  { key: 'taxCollected', label: 'PPN 11% Dipungut' },
]

export function TaxReportClient({ storeId, currency }: TaxReportClientProps) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  const { data: rows = [], isLoading } = useQuery<TaxMonthRow[]>({
    queryKey: ['tax-report', storeId, year],
    queryFn: async () => {
      const res = await fetch(`/api/reports/tax?storeId=${storeId}&year=${year}`)
      if (!res.ok) throw new Error('Gagal memuat laporan pajak')
      return res.json()
    },
  })

  // Fill missing months with zeros
  const allMonths: TaxMonthRow[] = Array.from({ length: 12 }, (_, i) => {
    const found = rows.find(r => r.month === i + 1)
    return found ?? { month: i + 1, grossRevenue: 0, taxableRevenue: 0, taxCollected: 0, orderCount: 0 }
  })

  const annual = sumRows(allMonths)

  const exportRows = [
    ...allMonths.map(r => ({
      month: MONTH_NAMES[r.month - 1],
      orderCount: r.orderCount,
      grossRevenue: r.grossRevenue,
      taxableRevenue: r.taxableRevenue,
      taxCollected: r.taxCollected,
    })),
    {
      month: `TOTAL ${year}`,
      orderCount: annual.orderCount,
      grossRevenue: annual.grossRevenue,
      taxableRevenue: annual.taxableRevenue,
      taxCollected: annual.taxCollected,
    },
  ]

  async function handleExportPdf() {
    setIsExportingPdf(true)
    try {
      await exportToPDF(
        `Laporan Pajak PPN 11% — Tahun ${year}`,
        EXPORT_COLUMNS,
        exportRows,
        `laporan-pajak-${year}`,
        currency,
      )
    } finally {
      setIsExportingPdf(false)
    }
  }

  function handleExportCsv() {
    exportToCSV(exportRows, `laporan-pajak-${year}`, EXPORT_COLUMNS.map(c => c.key))
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">Laporan Pajak PPN</h1>
        <p className="mt-0.5 text-sm text-[var(--text-3)]">
          Ringkasan bulanan PPN 11% yang dipungut per tahun fiskal
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2">
          <span className="shrink-0 text-xs font-semibold text-[var(--text-3)]">Tahun Fiskal</span>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="bg-transparent text-sm text-[var(--text-1)] focus:outline-none"
            aria-label="Pilih tahun fiskal"
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex gap-2">
          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf || isLoading}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] transition-colors hover:bg-[var(--bg-muted)] disabled:opacity-50"
            aria-label="Ekspor PDF"
          >
            <FileText className="h-3.5 w-3.5" />
            {isExportingPdf ? 'Mengekspor…' : 'PDF'}
          </button>
          <button
            onClick={handleExportCsv}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] transition-colors hover:bg-[var(--bg-muted)] disabled:opacity-50"
            aria-label="Ekspor CSV"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Annual summary cards */}
      {!isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <p className="mb-1 text-xs font-semibold text-[var(--text-3)]">Total Omzet Bruto</p>
            <p className="text-lg font-bold text-[var(--text-1)]">
              {formatCurrency(annual.grossRevenue, currency)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <p className="mb-1 text-xs font-semibold text-[var(--text-3)]">Total DPP</p>
            <p className="text-lg font-bold text-[var(--text-1)]">
              {formatCurrency(annual.taxableRevenue, currency)}
            </p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
            <p className="mb-1 text-xs font-semibold text-amber-600">Total PPN Dipungut</p>
            <p className="text-lg font-bold text-amber-700">
              {formatCurrency(annual.taxCollected, currency)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
            <p className="mb-1 text-xs font-semibold text-[var(--text-3)]">Total Pesanan</p>
            <p className="text-lg font-bold text-[var(--text-1)]">{annual.orderCount}</p>
          </div>
        </div>
      )}

      {/* Monthly table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        <div className="border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-sm font-bold text-[var(--text-1)]">Rincian Bulanan — {year}</h2>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">Tarif PPN: 11% (UU HPP No. 7/2021)</p>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-subtle)]">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-3)]">Bulan</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--text-3)]">Pesanan</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--text-3)]">Omzet Bruto</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--text-3)]">DPP (100/111 × Bruto)</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-amber-600">PPN 11% Dipungut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {QUARTERS.map(q => {
                  const qRows = allMonths.filter(r => q.months.includes(r.month))
                  const qTotals = sumRows(qRows)
                  return [
                    ...qRows.map(r => (
                      <tr key={r.month} className="hover:bg-[var(--bg-subtle)]/50">
                        <td className="px-5 py-2.5 text-[var(--text-1)]">{MONTH_NAMES[r.month - 1]}</td>
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
                      </tr>
                    )),
                    // Quarterly totals row
                    <tr key={`q-${q.label}`} className="border-t-2 border-amber-100 bg-amber-50/60">
                      <td className="px-5 py-2 text-xs font-bold text-amber-700">Total {q.label}</td>
                      <td className="px-5 py-2 text-right font-mono text-xs font-bold text-amber-700">
                        {qTotals.orderCount}
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-xs font-bold text-amber-700">
                        {formatCurrency(qTotals.grossRevenue, currency)}
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-xs font-bold text-amber-700">
                        {formatCurrency(qTotals.taxableRevenue, currency)}
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-xs font-bold text-amber-700">
                        {formatCurrency(qTotals.taxCollected, currency)}
                      </td>
                    </tr>,
                  ]
                })}
              </tbody>
              <tfoot className="border-t-2 border-[var(--border)] bg-[var(--bg-subtle)]">
                <tr>
                  <td className="px-5 py-3 text-sm font-bold text-[var(--text-1)]">TOTAL {year}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-[var(--text-1)]">
                    {annual.orderCount}
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-[var(--text-1)]">
                    {formatCurrency(annual.grossRevenue, currency)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-[var(--text-1)]">
                    {formatCurrency(annual.taxableRevenue, currency)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-amber-600">
                    {formatCurrency(annual.taxCollected, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Tax rate note */}
      <p className="text-xs text-[var(--text-3)]">
        * DPP (Dasar Pengenaan Pajak) = Omzet Bruto × 100/111. PPN = DPP × 11%. Berlaku tarif PPN sesuai UU No. 7 Tahun 2021 (HPP) efektif 1 April 2022.
      </p>
    </div>
  )
}
