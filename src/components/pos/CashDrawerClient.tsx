'use client'

import { useState, useEffect, useCallback } from 'react'
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Plus, X, Loader2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { calcExpectedCash, calcVariance, hasVariance, varianceLabel } from '@/lib/cash-drawer'

export {
  calcExpectedCash,
  calcVariance,
  hasVariance,
  varianceLabel,
  buildEODReport,
  aggregateByType,
  totalByType,
  movementEffect,
} from '@/lib/cash-drawer'

type DrawerStatus = 'OPEN' | 'CLOSED'
type MovementType = 'SALE' | 'REFUND' | 'PAYOUT' | 'FLOAT_ADD'

interface CashDrawerRow {
  id: string
  storeId: string
  shiftId?: string | null
  openedAt: string
  closedAt?: string | null
  openingFloat: number
  expectedCash: number
  actualCash: number
  variance: number
  closedBy?: string | null
  status: DrawerStatus
}

interface CashMovementRow {
  id: string
  drawerId: string
  storeId: string
  type: MovementType
  amount: number
  reference?: string | null
  note?: string | null
  createdAt: string
}

interface EODReport {
  drawerId: string
  openingFloat: number
  totalSales: number
  totalRefunds: number
  totalPayouts: number
  totalFloatAdds: number
  expectedCash: number
  actualCash: number
  variance: number
  movementCount: number
  status: DrawerStatus
}

interface Props {
  storeId: string
  currency: string
}

const MOVEMENT_LABELS: Record<MovementType, string> = {
  SALE: 'Penjualan',
  REFUND: 'Pengembalian',
  PAYOUT: 'Pengeluaran',
  FLOAT_ADD: 'Tambah Modal',
}

const MOVEMENT_COLORS: Record<MovementType, string> = {
  SALE: 'text-green-500',
  FLOAT_ADD: 'text-blue-500',
  REFUND: 'text-orange-500',
  PAYOUT: 'text-red-500',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function SummaryCard({ label, value, currency, icon, className }: {
  label: string; value: number; currency: string; icon: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4', className)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--text-3)]">{label}</span>
        <span className="text-[var(--text-3)]">{icon}</span>
      </div>
      <p className="text-xl font-bold text-[var(--text-1)]">{formatCurrency(value, currency)}</p>
    </div>
  )
}

export default function CashDrawerClient({ storeId, currency }: Props) {
  const [drawers, setDrawers] = useState<CashDrawerRow[]>([])
  const [activeDrawer, setActiveDrawer] = useState<CashDrawerRow | null>(null)
  const [movements, setMovements] = useState<CashMovementRow[]>([])
  const [report, setReport] = useState<EODReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Open drawer form
  const [showOpenForm, setShowOpenForm] = useState(false)
  const [openingFloat, setOpeningFloat] = useState('')

  // Movement form
  const [showMovForm, setShowMovForm] = useState(false)
  const [movType, setMovType] = useState<MovementType>('SALE')
  const [movAmount, setMovAmount] = useState('')
  const [movNote, setMovNote] = useState('')
  const [movRef, setMovRef] = useState('')

  // Close form
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [actualCash, setActualCash] = useState('')

  const fetchDrawers = useCallback(async () => {
    const res = await fetch(`/api/cash-drawers?storeId=${storeId}`)
    const data = await res.json() as any
    if (data.error) return
    const rows: CashDrawerRow[] = data
    setDrawers(rows)
    const open = rows.find(d => d.status === 'OPEN') ?? null
    setActiveDrawer(open)
  }, [storeId])

  const fetchMovements = useCallback(async (drawerId: string) => {
    const res = await fetch(`/api/cash-drawers/${drawerId}/movements`)
    const data = await res.json() as any
    if (!data.error) setMovements(data)
  }, [])

  const fetchReport = useCallback(async (drawerId: string) => {
    const res = await fetch(`/api/cash-drawers/${drawerId}/report`)
    const data = await res.json() as any
    if (!data.error) setReport(data)
  }, [])

  useEffect(() => {
    fetchDrawers().finally(() => setLoading(false))
  }, [fetchDrawers])

  useEffect(() => {
    if (activeDrawer) {
      fetchMovements(activeDrawer.id)
      fetchReport(activeDrawer.id)
    }
  }, [activeDrawer, fetchMovements, fetchReport])

  const handleOpenDrawer = async () => {
    const float = parseFloat(openingFloat.replace(/[^0-9.]/g, ''))
    if (isNaN(float) || float < 0) { toast.error('Modal awal tidak valid'); return }
    setSaving(true)
    const res = await fetch(`/api/cash-drawers?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openingFloat: float }),
    })
    const data = await res.json() as any
    setSaving(false)
    if (data.error) { toast.error(data.error); return }
    toast.success('Laci kasir dibuka')
    setShowOpenForm(false)
    setOpeningFloat('')
    await fetchDrawers()
  }

  const handleAddMovement = async () => {
    const amount = parseFloat(movAmount.replace(/[^0-9.]/g, ''))
    if (!activeDrawer) return
    if (isNaN(amount) || amount <= 0) { toast.error('Jumlah tidak valid'); return }
    setSaving(true)
    const res = await fetch(`/api/cash-drawers/${activeDrawer.id}/movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: movType, amount, note: movNote || null, reference: movRef || null }),
    })
    const data = await res.json() as any
    setSaving(false)
    if (data.error) { toast.error(data.error); return }
    toast.success('Transaksi dicatat')
    setShowMovForm(false)
    setMovAmount(''); setMovNote(''); setMovRef('')
    await fetchMovements(activeDrawer.id)
    await fetchReport(activeDrawer.id)
  }

  const handleCloseDrawer = async () => {
    if (!activeDrawer) return
    const actual = parseFloat(actualCash.replace(/[^0-9.]/g, ''))
    if (isNaN(actual) || actual < 0) { toast.error('Saldo aktual tidak valid'); return }
    setSaving(true)
    const res = await fetch(`/api/cash-drawers/${activeDrawer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actualCash: actual }),
    })
    const data = await res.json() as any
    setSaving(false)
    if (data.error) { toast.error(data.error); return }
    toast.success('Laci kasir ditutup')
    setShowCloseForm(false)
    setActualCash('')
    await fetchDrawers()
    await fetchReport(activeDrawer.id)
  }

  const selectedDrawer = activeDrawer ?? drawers[0] ?? null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-[var(--text-3)]" size={28} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Laci Kasir</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">Kelola kas harian & rekonsiliasi akhir hari</p>
        </div>
        {!activeDrawer ? (
          <button
            onClick={() => setShowOpenForm(true)}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} /> Buka Laci Kasir
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowMovForm(true)}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-1)] hover:bg-[var(--bg-2)]"
            >
              <Plus size={16} /> Catat Transaksi
            </button>
            <button
              onClick={() => setShowCloseForm(true)}
              className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
            >
              Tutup Laci
            </button>
          </div>
        )}
      </div>

      {/* Status badge */}
      {activeDrawer ? (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle size={16} />
          <span>Laci terbuka sejak {formatDate(activeDrawer.openedAt)}</span>
        </div>
      ) : drawers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-[var(--text-3)]">
          Belum ada laci kasir. Klik &ldquo;Buka Laci Kasir&rdquo; untuk memulai shift.
        </div>
      ) : null}

      {/* EOD Report cards */}
      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Total Penjualan" value={report.totalSales} currency={currency} icon={<TrendingUp size={16} />} />
            <SummaryCard label="Pengembalian" value={report.totalRefunds} currency={currency} icon={<TrendingDown size={16} />} />
            <SummaryCard label="Pengeluaran" value={report.totalPayouts} currency={currency} icon={<TrendingDown size={16} />} />
            <SummaryCard label="Modal Awal" value={report.openingFloat} currency={currency} icon={<DollarSign size={16} />} />
          </div>

          {/* Reconciliation */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
            <h2 className="font-semibold text-[var(--text-1)]">Rekonsiliasi Kas</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <p className="text-xs text-[var(--text-3)]">Kas yang Diharapkan</p>
                <p className="text-lg font-bold text-[var(--text-1)]">{formatCurrency(report.expectedCash, currency)}</p>
              </div>
              {report.status === 'CLOSED' && (
                <>
                  <div>
                    <p className="text-xs text-[var(--text-3)]">Kas Aktual</p>
                    <p className="text-lg font-bold text-[var(--text-1)]">{formatCurrency(report.actualCash, currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)]">Selisih</p>
                    <p className={cn('text-lg font-bold', report.variance === 0 ? 'text-green-500' : 'text-red-500')}>
                      {report.variance > 0 ? '+' : ''}{formatCurrency(report.variance, currency)}
                    </p>
                    {hasVariance(report.variance) && (
                      <span className="inline-flex items-center gap-1 text-xs text-orange-500 mt-1">
                        <AlertTriangle size={12} /> {varianceLabel(report.variance)}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Movements table */}
      {selectedDrawer && movements.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h2 className="font-semibold text-[var(--text-1)]">Riwayat Transaksi ({movements.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-2)]">
                  <th className="text-left px-4 py-2 text-[var(--text-3)] font-medium">Waktu</th>
                  <th className="text-left px-4 py-2 text-[var(--text-3)] font-medium">Tipe</th>
                  <th className="text-left px-4 py-2 text-[var(--text-3)] font-medium">Catatan</th>
                  <th className="text-right px-4 py-2 text-[var(--text-3)] font-medium">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-2)]">
                    <td className="px-4 py-2.5 text-[var(--text-3)] whitespace-nowrap">{formatDate(m.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('font-medium', MOVEMENT_COLORS[m.type])}>
                        {MOVEMENT_LABELS[m.type]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-2)]">{m.note ?? m.reference ?? '—'}</td>
                    <td className={cn('px-4 py-2.5 text-right font-medium', MOVEMENT_COLORS[m.type])}>
                      {m.type === 'REFUND' || m.type === 'PAYOUT' ? '-' : '+'}{formatCurrency(m.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Past drawers */}
      {drawers.filter(d => d.status === 'CLOSED').length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h2 className="font-semibold text-[var(--text-1)]">Riwayat Shift</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-2)]">
                  <th className="text-left px-4 py-2 text-[var(--text-3)] font-medium">Dibuka</th>
                  <th className="text-left px-4 py-2 text-[var(--text-3)] font-medium">Ditutup</th>
                  <th className="text-right px-4 py-2 text-[var(--text-3)] font-medium">Kas Diharapkan</th>
                  <th className="text-right px-4 py-2 text-[var(--text-3)] font-medium">Kas Aktual</th>
                  <th className="text-right px-4 py-2 text-[var(--text-3)] font-medium">Selisih</th>
                </tr>
              </thead>
              <tbody>
                {drawers.filter(d => d.status === 'CLOSED').map(d => (
                  <tr key={d.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-2)]">
                    <td className="px-4 py-2.5 text-[var(--text-2)] whitespace-nowrap">{formatDate(d.openedAt)}</td>
                    <td className="px-4 py-2.5 text-[var(--text-2)] whitespace-nowrap">{d.closedAt ? formatDate(d.closedAt) : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-1)]">{formatCurrency(d.expectedCash, currency)}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-1)]">{formatCurrency(d.actualCash, currency)}</td>
                    <td className={cn('px-4 py-2.5 text-right font-medium', d.variance === 0 ? 'text-green-500' : 'text-orange-500')}>
                      {d.variance > 0 ? '+' : ''}{formatCurrency(d.variance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modals ── */}

      {/* Open drawer modal */}
      {showOpenForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[var(--text-1)]">Buka Laci Kasir</h2>
              <button onClick={() => setShowOpenForm(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]"><X size={18} /></button>
            </div>
            <label className="block text-sm text-[var(--text-2)] mb-1">Modal Awal (Float)</label>
            <input
              type="number"
              min="0"
              value={openingFloat}
              onChange={e => setOpeningFloat(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowOpenForm(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)]">Batal</button>
              <button onClick={handleOpenDrawer} disabled={saving} className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {saving && <Loader2 size={14} className="animate-spin" />} Buka
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add movement modal */}
      {showMovForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[var(--text-1)]">Catat Transaksi Kas</h2>
              <button onClick={() => setShowMovForm(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-[var(--text-2)] mb-1">Tipe Transaksi</label>
                <select
                  value={movType}
                  onChange={e => setMovType(e.target.value as MovementType)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)]"
                >
                  {(Object.entries(MOVEMENT_LABELS) as [MovementType, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-[var(--text-2)] mb-1">Jumlah</label>
                <input
                  type="number"
                  min="0"
                  value={movAmount}
                  onChange={e => setMovAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-2)] mb-1">Referensi (opsional)</label>
                <input
                  value={movRef}
                  onChange={e => setMovRef(e.target.value)}
                  placeholder="No. transaksi, dll."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-2)] mb-1">Catatan (opsional)</label>
                <input
                  value={movNote}
                  onChange={e => setMovNote(e.target.value)}
                  placeholder="Keterangan tambahan"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowMovForm(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)]">Batal</button>
              <button onClick={handleAddMovement} disabled={saving} className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {saving && <Loader2 size={14} className="animate-spin" />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close drawer modal */}
      {showCloseForm && report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[var(--text-1)]">Tutup Laci Kasir</h2>
              <button onClick={() => setShowCloseForm(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]"><X size={18} /></button>
            </div>
            <div className="rounded-lg bg-[var(--bg-2)] p-3 mb-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-[var(--text-3)]">Modal Awal</span>
                <span className="text-[var(--text-1)]">{formatCurrency(report.openingFloat, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-3)]">Total Penjualan</span>
                <span className="text-green-500">+{formatCurrency(report.totalSales, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-3)]">Pengembalian</span>
                <span className="text-orange-500">-{formatCurrency(report.totalRefunds, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-3)]">Pengeluaran</span>
                <span className="text-red-500">-{formatCurrency(report.totalPayouts, currency)}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-1 font-medium">
                <span className="text-[var(--text-2)]">Kas Diharapkan</span>
                <span className="text-[var(--text-1)]">{formatCurrency(report.expectedCash, currency)}</span>
              </div>
            </div>
            <label className="block text-sm text-[var(--text-2)] mb-1">Kas Aktual (hitung fisik)</label>
            <input
              type="number"
              min="0"
              value={actualCash}
              onChange={e => setActualCash(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text-1)]"
            />
            {actualCash && !isNaN(parseFloat(actualCash)) && (
              <p className={cn('text-sm mt-2', parseFloat(actualCash) === report.expectedCash ? 'text-green-500' : 'text-orange-500')}>
                Selisih: {parseFloat(actualCash) >= report.expectedCash ? '+' : ''}
                {formatCurrency(parseFloat(actualCash) - report.expectedCash, currency)}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCloseForm(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)]">Batal</button>
              <button onClick={handleCloseDrawer} disabled={saving} className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50">
                {saving && <Loader2 size={14} className="animate-spin" />} Tutup Laci
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
