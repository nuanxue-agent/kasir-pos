'use client'

import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DollarSign, Plus, Minus, X, Loader2, Printer,
  CheckCircle2, AlertTriangle, Clock, TrendingUp, TrendingDown,
  ArrowDownCircle, ArrowUpCircle, Banknote,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CashMovement {
  id: string
  registerId: string
  type: 'IN' | 'OUT'
  amount: number
  reason: string | null
  createdAt: string
}

interface CashRegister {
  id: string
  storeId: string
  employeeId: string
  openedAt: string
  closedAt: string | null
  openingFloat: number
  closingActual: number | null
  closingExpected: number | null
  variance: number | null
  status: 'OPEN' | 'CLOSED'
  movements: CashMovement[]
  cashSales: number
  cashIn: number
  cashOut: number
  expectedCash: number
}

interface ShiftSummary {
  totalOrders: number
  totalSales: number
  cashSalesTotal: number
  cardSalesTotal: number
  avgOrderValue: number
  openedAt: string
  closedAt: string
}

interface CloseResult {
  registerId: string
  closedAt: string
  openingFloat: number
  cashSales: number
  cashIn: number
  cashOut: number
  closingExpected: number
  closingActual: number
  variance: number
  status: 'CLOSED'
  summary: ShiftSummary
}

interface Props {
  storeId: string
  currency: string
  employeeName?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function fmtDuration(openedAt: string, closedAt?: string | null): string {
  const end = closedAt ? new Date(closedAt) : new Date()
  const mins = Math.round((end.getTime() - new Date(openedAt).getTime()) / 60_000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}j ${m}m` : `${m}m`
}

// ─── Shift Summary Print ──────────────────────────────────────────────────────

function printShiftSummary(result: CloseResult, currency: string, employeeName: string) {
  const fmt = (n: number) => formatCurrency(n, currency)
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Laporan Shift</title>
  <style>
    body { font-family: monospace; font-size: 12px; max-width: 300px; margin: 0 auto; padding: 16px; }
    h2 { text-align: center; font-size: 14px; margin: 0 0 8px; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; margin: 3px 0; }
    .label { color: #555; }
    .total { font-weight: bold; font-size: 13px; }
    .variance { color: ${result.variance >= 0 ? 'green' : 'red'}; font-weight: bold; }
  </style>
</head>
<body>
  <h2>LAPORAN TUTUP KASIR</h2>
  <div class="divider"></div>
  <div class="row"><span class="label">Kasir</span><span>${employeeName}</span></div>
  <div class="row"><span class="label">Buka</span><span>${fmtTime(result.summary.openedAt)}</span></div>
  <div class="row"><span class="label">Tutup</span><span>${fmtTime(result.summary.closedAt)}</span></div>
  <div class="divider"></div>
  <div class="row"><span class="label">Total Transaksi</span><span>${result.summary.totalOrders} trx</span></div>
  <div class="row total"><span>Total Penjualan</span><span>${fmt(result.summary.totalSales)}</span></div>
  <div class="row"><span class="label">Tunai</span><span>${fmt(result.summary.cashSalesTotal)}</span></div>
  <div class="row"><span class="label">Non-Tunai</span><span>${fmt(result.summary.cardSalesTotal)}</span></div>
  <div class="row"><span class="label">Rata-rata / Trx</span><span>${fmt(result.summary.avgOrderValue)}</span></div>
  <div class="divider"></div>
  <div class="row"><span class="label">Modal Awal</span><span>${fmt(result.openingFloat)}</span></div>
  <div class="row"><span class="label">Penjualan Tunai</span><span>+${fmt(result.cashSales)}</span></div>
  <div class="row"><span class="label">Kas Masuk</span><span>+${fmt(result.cashIn)}</span></div>
  <div class="row"><span class="label">Kas Keluar</span><span>-${fmt(result.cashOut)}</span></div>
  <div class="row total"><span>Ekspektasi Kas</span><span>${fmt(result.closingExpected)}</span></div>
  <div class="row total"><span>Aktual Kas</span><span>${fmt(result.closingActual)}</span></div>
  <div class="divider"></div>
  <div class="row total"><span>Selisih</span><span class="variance">${result.variance >= 0 ? '+' : ''}${fmt(result.variance)}</span></div>
  <div class="divider"></div>
  <p style="text-align:center;color:#888;font-size:10px;">Dicetak ${new Date().toLocaleString('id-ID')}</p>
</body>
</html>`
  const win = window.open('', '_blank', 'width=360,height=600')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CashRegisterClient({ storeId, currency, employeeName = 'Kasir' }: Props) {
  const qc = useQueryClient()

  // Open register state
  const [openingFloat, setOpeningFloat] = useState('')
  const [opening, setOpening] = useState(false)

  // Close register state
  const [closingActual, setClosingActual] = useState('')
  const [closing, setClosing] = useState(false)
  const [closeResult, setCloseResult] = useState<CloseResult | null>(null)

  // Movement state
  const [showMovement, setShowMovement] = useState(false)
  const [movType, setMovType] = useState<'IN' | 'OUT'>('IN')
  const [movAmount, setMovAmount] = useState('')
  const [movReason, setMovReason] = useState('')
  const [savingMov, setSavingMov] = useState(false)

  // Current register
  const { data: register, isLoading } = useQuery<CashRegister | null>({
    queryKey: ['cash-register', storeId],
    queryFn: () => fetch(`/api/cash-register/current?storeId=${storeId}`).then(r => r.json()),
    refetchInterval: 30_000,
  })

  const fmt = useCallback((n: number) => formatCurrency(n, currency), [currency])

  const varianceColor = useMemo(() => {
    if (!register) return ''
    const v = register.expectedCash - (register.openingFloat)
    return 'text-stone-700'
  }, [register])

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleOpen() {
    const float = parseFloat(openingFloat) || 0
    if (float < 0) return
    setOpening(true)
    try {
      const res = await fetch('/api/cash-register/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, openingFloat: float }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        alert(d.error ?? 'Gagal membuka kasir')
        return
      }
      await qc.invalidateQueries({ queryKey: ['cash-register', storeId] })
      setOpeningFloat('')
    } finally {
      setOpening(false)
    }
  }

  async function handleClose() {
    if (!register) return
    const actual = parseFloat(closingActual)
    if (isNaN(actual) || actual < 0) return
    setClosing(true)
    try {
      const res = await fetch('/api/cash-register/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registerId: register.id, closingActual: actual }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        alert(d.error ?? 'Gagal menutup kasir')
        return
      }
      const result: CloseResult = await res.json()
      setCloseResult(result)
      await qc.invalidateQueries({ queryKey: ['cash-register', storeId] })
      setClosingActual('')
    } finally {
      setClosing(false)
    }
  }

  async function handleMovement() {
    if (!register) return
    const amount = parseFloat(movAmount)
    if (isNaN(amount) || amount <= 0) return
    setSavingMov(true)
    try {
      const res = await fetch('/api/cash-register/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registerId: register.id, type: movType, amount, reason: movReason }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        alert(d.error ?? 'Gagal menyimpan mutasi')
        return
      }
      await qc.invalidateQueries({ queryKey: ['cash-register', storeId] })
      setMovAmount('')
      setMovReason('')
      setShowMovement(false)
    } finally {
      setSavingMov(false)
    }
  }

  // ── Render: loading ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-stone-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Memuat data kasir...</span>
      </div>
    )
  }

  // ── Render: close result / summary ────────────────────────────────────────

  if (closeResult) {
    const v = closeResult.variance
    const positive = v >= 0
    return (
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className={cn(
          'rounded-2xl p-5 border text-center',
          positive ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
        )}>
          <CheckCircle2 className={cn('w-10 h-10 mx-auto mb-2', positive ? 'text-emerald-500' : 'text-red-400')} />
          <h2 className="text-lg font-semibold text-stone-800">Kasir Ditutup</h2>
          <p className="text-sm text-stone-500 mt-1">{fmtTime(closeResult.closedAt)}</p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
          <div className="px-4 py-3 flex justify-between text-sm">
            <span className="text-stone-500">Total Transaksi</span>
            <span className="font-medium">{closeResult.summary.totalOrders} trx</span>
          </div>
          <div className="px-4 py-3 flex justify-between text-sm">
            <span className="text-stone-500">Total Penjualan</span>
            <span className="font-semibold text-stone-800">{fmt(closeResult.summary.totalSales)}</span>
          </div>
          <div className="px-4 py-3 flex justify-between text-sm">
            <span className="text-stone-500">Penjualan Tunai</span>
            <span>{fmt(closeResult.summary.cashSalesTotal)}</span>
          </div>
          <div className="px-4 py-3 flex justify-between text-sm">
            <span className="text-stone-500">Non-Tunai</span>
            <span>{fmt(closeResult.summary.cardSalesTotal)}</span>
          </div>
          <div className="px-4 py-3 flex justify-between text-sm">
            <span className="text-stone-500">Rata-rata / Trx</span>
            <span>{fmt(closeResult.summary.avgOrderValue)}</span>
          </div>
          <div className="px-4 py-3 flex justify-between text-sm">
            <span className="text-stone-500">Modal Awal</span>
            <span>{fmt(closeResult.openingFloat)}</span>
          </div>
          <div className="px-4 py-3 flex justify-between text-sm">
            <span className="text-stone-500">Ekspektasi Kas</span>
            <span>{fmt(closeResult.closingExpected)}</span>
          </div>
          <div className="px-4 py-3 flex justify-between text-sm">
            <span className="text-stone-500">Aktual Kas</span>
            <span className="font-semibold">{fmt(closeResult.closingActual)}</span>
          </div>
          <div className="px-4 py-3 flex justify-between text-sm font-semibold">
            <span>Selisih</span>
            <span className={positive ? 'text-emerald-600' : 'text-red-600'}>
              {positive ? '+' : ''}{fmt(v)}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => printShiftSummary(closeResult, currency, employeeName)}
            className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
          >
            <Printer className="w-4 h-4" />
            Cetak Laporan
          </button>
          <button
            onClick={() => setCloseResult(null)}
            className="flex-1 flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl py-2.5 text-sm font-medium transition-colors"
          >
            Selesai
          </button>
        </div>
      </div>
    )
  }

  // ── Render: no open register ───────────────────────────────────────────────

  if (!register) {
    return (
      <div className="max-w-sm mx-auto p-4 space-y-4">
        <div className="text-center py-6">
          <Banknote className="w-12 h-12 mx-auto text-amber-400 mb-3" />
          <h2 className="text-lg font-semibold text-stone-800">Buka Kasir</h2>
          <p className="text-sm text-stone-500 mt-1">Masukkan modal awal untuk memulai shift</p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
          <label className="text-sm font-medium text-stone-700">Modal Awal (Rp)</label>
          <input
            type="number"
            min="0"
            className={inputCls}
            placeholder="0"
            value={openingFloat}
            onChange={e => setOpeningFloat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleOpen()}
          />
          <button
            onClick={handleOpen}
            disabled={opening}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
          >
            {opening ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
            {opening ? 'Memproses...' : 'Buka Kasir'}
          </button>
        </div>
      </div>
    )
  }

  // ── Render: open register ─────────────────────────────────────────────────

  const actualFloat = parseFloat(closingActual) || 0
  const variance = actualFloat > 0 ? actualFloat - register.expectedCash : null
  const variancePositive = variance !== null && variance >= 0

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      {/* Status header */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-emerald-800">Kasir Terbuka</p>
          <p className="text-xs text-emerald-600">
            Dibuka {fmtTime(register.openedAt)} · {fmtDuration(register.openedAt)}
          </p>
        </div>
        <Clock className="w-5 h-5 text-emerald-400" />
      </div>

      {/* Cash summary */}
      <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
        <div className="px-4 py-3 flex justify-between text-sm">
          <span className="text-stone-500">Modal Awal</span>
          <span className="font-medium">{fmt(register.openingFloat)}</span>
        </div>
        <div className="px-4 py-3 flex justify-between text-sm">
          <span className="text-stone-500 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Penjualan Tunai
          </span>
          <span className="text-emerald-600 font-medium">+{fmt(register.cashSales)}</span>
        </div>
        {register.cashIn > 0 && (
          <div className="px-4 py-3 flex justify-between text-sm">
            <span className="text-stone-500 flex items-center gap-1">
              <ArrowDownCircle className="w-3.5 h-3.5 text-blue-500" /> Kas Masuk
            </span>
            <span className="text-blue-600 font-medium">+{fmt(register.cashIn)}</span>
          </div>
        )}
        {register.cashOut > 0 && (
          <div className="px-4 py-3 flex justify-between text-sm">
            <span className="text-stone-500 flex items-center gap-1">
              <ArrowUpCircle className="w-3.5 h-3.5 text-red-400" /> Kas Keluar
            </span>
            <span className="text-red-500 font-medium">-{fmt(register.cashOut)}</span>
          </div>
        )}
        <div className="px-4 py-3 flex justify-between text-sm font-semibold bg-stone-50 rounded-b-2xl">
          <span>Ekspektasi Kas</span>
          <span className="text-stone-800">{fmt(register.expectedCash)}</span>
        </div>
      </div>

      {/* Movement history */}
      {register.movements.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200">
          <div className="px-4 py-3 border-b border-stone-100">
            <h3 className="text-sm font-semibold text-stone-700">Mutasi Kas</h3>
          </div>
          <div className="divide-y divide-stone-100 max-h-48 overflow-y-auto">
            {register.movements.map(m => (
              <div key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                {m.type === 'IN'
                  ? <ArrowDownCircle className="w-4 h-4 text-blue-500 shrink-0" />
                  : <ArrowUpCircle className="w-4 h-4 text-red-400 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-700 truncate">{m.reason || (m.type === 'IN' ? 'Kas Masuk' : 'Kas Keluar')}</p>
                  <p className="text-xs text-stone-400">{fmtTime(m.createdAt)}</p>
                </div>
                <span className={cn('text-sm font-medium', m.type === 'IN' ? 'text-blue-600' : 'text-red-500')}>
                  {m.type === 'IN' ? '+' : '-'}{fmt(m.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add movement */}
      {showMovement ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-700">Tambah Mutasi Kas</h3>
            <button onClick={() => setShowMovement(false)} className="text-stone-400 hover:text-stone-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setMovType('IN')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium border transition-colors',
                movType === 'IN'
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-blue-300'
              )}
            >
              <Plus className="w-3.5 h-3.5" /> Masuk
            </button>
            <button
              onClick={() => setMovType('OUT')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium border transition-colors',
                movType === 'OUT'
                  ? 'bg-red-500 text-white border-red-500'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-red-300'
              )}
            >
              <Minus className="w-3.5 h-3.5" /> Keluar
            </button>
          </div>
          <input
            type="number"
            min="0"
            className={inputCls}
            placeholder="Jumlah (Rp)"
            value={movAmount}
            onChange={e => setMovAmount(e.target.value)}
          />
          <input
            type="text"
            className={inputCls}
            placeholder="Keterangan (opsional)"
            value={movReason}
            onChange={e => setMovReason(e.target.value)}
          />
          <button
            onClick={handleMovement}
            disabled={savingMov || !movAmount}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
          >
            {savingMov ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Simpan Mutasi
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowMovement(true)}
          className="w-full flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl py-2.5 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Tambah Mutasi Kas
        </button>
      )}

      {/* Close register */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-stone-700">Tutup Kasir</h3>
        <p className="text-xs text-stone-400">Hitung fisik uang kas dan masukkan jumlahnya</p>
        <input
          type="number"
          min="0"
          className={inputCls}
          placeholder="Kas aktual (hasil hitung fisik)"
          value={closingActual}
          onChange={e => setClosingActual(e.target.value)}
        />
        {variance !== null && (
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl text-sm',
            variancePositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
          )}>
            {variancePositive
              ? <TrendingUp className="w-4 h-4" />
              : <AlertTriangle className="w-4 h-4" />
            }
            <span>Selisih: <strong>{variancePositive ? '+' : ''}{fmt(variance)}</strong></span>
          </div>
        )}
        <button
          onClick={handleClose}
          disabled={closing || !closingActual}
          className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
        >
          {closing
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <TrendingDown className="w-4 h-4" />
          }
          {closing ? 'Menutup...' : 'Tutup Kasir'}
        </button>
      </div>
    </div>
  )
}
