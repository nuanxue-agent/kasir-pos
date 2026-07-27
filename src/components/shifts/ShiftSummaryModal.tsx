'use client'

import { useQuery } from '@tanstack/react-query'
import {
  X,
  Printer,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ShiftSummaryData {
  shift: {
    id: string
    openedAt: string
    closedAt?: string | null
    userName?: string
    note?: string | null
    status: string
  }
  openingCash: number
  closingCash: number
  totalSales: number
  totalExpenses: number
  netCashFlow: number
  expectedCash: number
  cashVariance: number
  paymentBreakdown: Record<string, number>
  durationMinutes: number
}

interface Props {
  shiftId: string
  storeId: string
  currency: string
  storeName?: string
  onClose: () => void
  onConfirmClose: () => void
  confirmLabel?: string
  confirmLoading?: boolean
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} menit`
  return `${h} jam ${m} menit`
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Tunai',
  CARD: 'Kartu',
  QRIS: 'QRIS',
  TRANSFER: 'Transfer',
}

export default function ShiftSummaryModal({
  shiftId,
  storeId,
  currency,
  storeName = 'Toko',
  onClose,
  onConfirmClose,
  confirmLabel = 'Tutup Shift',
  confirmLoading = false,
}: Props) {
  const { data, isLoading } = useQuery<ShiftSummaryData>({
    queryKey: ['shift-summary', shiftId, storeId],
    queryFn: () => fetch(`/api/shifts/${shiftId}/summary?storeId=${storeId}`).then(r => r.json()),
    enabled: !!shiftId,
  })

  const fmt = (n: number) => formatCurrency(n, currency)
  const varianceOk = data ? Math.abs(data.cashVariance) < 1000 : true

  function handlePrint() {
    if (!data) return
    const lines = [
      `LAPORAN SHIFT`,
      `${storeName}`,
      `─────────────────────────`,
      `Kasir : ${data.shift.userName ?? '—'}`,
      `Buka  : ${fmtTime(data.shift.openedAt)}`,
      `Tutup : ${data.shift.closedAt ? fmtTime(data.shift.closedAt) : '—'}`,
      `Durasi: ${fmtDuration(data.durationMinutes)}`,
      `─────────────────────────`,
      `Kas Awal        : ${fmt(data.openingCash)}`,
      `Total Penjualan : ${fmt(data.totalSales)}`,
      `Total Pengeluaran: -${fmt(data.totalExpenses)}`,
      `Net Arus Kas    : ${fmt(data.netCashFlow)}`,
      `─────────────────────────`,
      `Ekspektasi Kas  : ${fmt(data.expectedCash)}`,
      `Kas Aktual      : ${fmt(data.closingCash)}`,
      `Selisih         : ${data.cashVariance >= 0 ? '+' : ''}${fmt(data.cashVariance)}`,
      `─────────────────────────`,
      `RINCIAN PEMBAYARAN`,
      ...Object.entries(data.paymentBreakdown).map(
        ([m, v]) => `${(METHOD_LABELS[m] ?? m).padEnd(12)}: ${fmt(v)}`,
      ),
      `─────────────────────────`,
      data.shift.note ? `Catatan: ${data.shift.note}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const w = window.open('', '_blank', 'width=400,height=600')
    if (!w) return
    w.document.write(
      `<html><head><title>Laporan Shift</title><style>body{font-family:monospace;font-size:13px;padding:16px;white-space:pre}</style></head><body>${lines}</body></html>`,
    )
    w.document.close()
    w.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-5 py-4">
          <div>
            <h2 className="font-bold text-[var(--text-1)]">Ringkasan Shift</h2>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">
              Laporan akhir hari sebelum penutupan
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-[var(--text-3)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
              ))}
            </div>
          ) : !data ? (
            <div className="py-8 text-center text-sm text-[var(--text-3)]">
              Gagal memuat ringkasan shift
            </div>
          ) : (
            <>
              {/* Shift meta */}
              <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
                <Clock className="h-4 w-4 shrink-0 text-[var(--text-3)]" />
                <div className="min-w-0 text-sm text-[var(--text-2)]">
                  <span className="font-medium text-[var(--text-1)]">
                    {data.shift.userName ?? 'Kasir'}
                  </span>
                  {' · '}
                  {fmtTime(data.shift.openedAt)}
                  {' – '}
                  {data.shift.closedAt ? fmtTime(data.shift.closedAt) : 'Sekarang'}
                  {data.durationMinutes > 0 && (
                    <span className="ml-1 text-[var(--text-3)]">
                      ({fmtDuration(data.durationMinutes)})
                    </span>
                  )}
                </div>
              </div>

              {/* Cash flow summary */}
              <div>
                <p className="mb-3 text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                  Arus Kas
                </p>
                <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]">
                  {[
                    {
                      label: 'Kas Awal',
                      value: data.openingCash,
                      icon: DollarSign,
                      color: 'text-[var(--text-1)]',
                      prefix: '',
                    },
                    {
                      label: 'Total Penjualan',
                      value: data.totalSales,
                      icon: TrendingUp,
                      color: 'text-emerald-600',
                      prefix: '+',
                    },
                    {
                      label: 'Total Pengeluaran',
                      value: data.totalExpenses,
                      icon: TrendingDown,
                      color: 'text-red-500',
                      prefix: '-',
                    },
                  ].map(({ label, value, icon: Icon, color, prefix }) => (
                    <div key={label} className="flex items-center gap-3 px-4 py-3">
                      <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                      <span className="flex-1 text-sm text-[var(--text-2)]">{label}</span>
                      <span className={`text-sm font-semibold ${color}`}>
                        {prefix}
                        {fmt(value)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 rounded-b-xl bg-[var(--bg-card)] px-4 py-3">
                    <div className="flex-1 text-sm font-bold text-[var(--text-1)]">
                      Net Arus Kas
                    </div>
                    <span
                      className={`text-sm font-bold ${data.netCashFlow >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                    >
                      {data.netCashFlow >= 0 ? '+' : ''}
                      {fmt(data.netCashFlow)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cash reconciliation */}
              <div>
                <p className="mb-3 text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                  Rekonsiliasi Kas
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                    <p className="text-xs text-[var(--text-3)]">Ekspektasi Kas</p>
                    <p className="mt-1 text-base font-bold text-[var(--text-1)]">
                      {fmt(data.expectedCash)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                    <p className="text-xs text-[var(--text-3)]">Kas Aktual</p>
                    <p className="mt-1 text-base font-bold text-[var(--text-1)]">
                      {fmt(data.closingCash)}
                    </p>
                  </div>
                </div>
                <div
                  className={`mt-3 flex items-center gap-2 rounded-xl p-3 text-sm font-medium ${
                    varianceOk
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-red-200 bg-red-50 text-red-600'
                  }`}
                >
                  {varianceOk ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                  )}
                  <span>Selisih</span>
                  <span className="ml-auto font-bold">
                    {data.cashVariance >= 0 ? '+' : ''}
                    {fmt(data.cashVariance)}
                  </span>
                </div>
              </div>

              {/* Payment breakdown */}
              {Object.keys(data.paymentBreakdown).length > 0 && (
                <div>
                  <p className="mb-3 text-xs font-semibold tracking-wide text-[var(--text-2)] uppercase">
                    Rincian Metode Pembayaran
                  </p>
                  <div className="space-y-2">
                    {Object.entries(data.paymentBreakdown).map(([method, amount]) => {
                      const pct = data.totalSales > 0 ? (amount / data.totalSales) * 100 : 0
                      return (
                        <div key={method} className="flex items-center gap-3">
                          <span className="w-20 shrink-0 text-sm text-[var(--text-2)]">
                            {METHOD_LABELS[method] ?? method}
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                            <div
                              className="h-full rounded-full bg-amber-400 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-28 shrink-0 text-right text-sm font-medium text-[var(--text-1)]">
                            {fmt(amount)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 flex gap-3 border-t border-[var(--border)] bg-[var(--bg-card)] px-5 pt-4 pb-5">
          <button
            onClick={handlePrint}
            disabled={isLoading || !data}
            className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-2)] transition-colors hover:border-amber-300 hover:bg-[var(--bg-subtle)] hover:text-amber-700 disabled:opacity-40"
          >
            <Printer className="h-4 w-4" />
            Cetak
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-subtle)]"
          >
            Batal
          </button>
          <button
            onClick={onConfirmClose}
            disabled={confirmLoading}
            className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
          >
            {confirmLoading ? 'Menutup…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
