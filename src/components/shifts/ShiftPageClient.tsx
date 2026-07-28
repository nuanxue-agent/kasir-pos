'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, DollarSign, TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, X, ChevronDown, ChevronUp, Printer, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { printReceiptBrowser } from '@/lib/receipt'

interface Shift {
  id: string
  userId: string
  userName?: string
  openedAt: string
  closedAt?: string | null
  openingCash: number
  closingCash?: number | null
  expectedCash?: number | null
  note?: string | null
  status: 'OPEN' | 'CLOSED'
  salesCash?: number | null
  totalExpenses?: number | null
}

interface Props { storeId: string; currency: string; storeName?: string }

const inputCls = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

const DENOMS = [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000]

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmt(n: number, currency: string) {
  return formatCurrency(n, currency)
}

export default function ShiftsPageClient({ storeId, currency, storeName = 'Toko' }: Props) {
  const qc = useQueryClient()
  const [openingCash, setOpeningCash] = useState('')
  const [closeNote, setCloseNote] = useState('')
  const [showOpenForm, setShowOpenForm] = useState(false)
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Denomination state: key = denom value, val = count string
  const [denoms, setDenoms] = useState<Record<number, string>>(
    Object.fromEntries(DENOMS.map(d => [d, '']))
  )

  const denomTotal = useMemo(
    () => DENOMS.reduce((s, d) => s + (Number(denoms[d]) || 0) * d, 0),
    [denoms]
  )

  const { data: activeShift, isLoading: loadingActive } = useQuery<Shift | null>({
    queryKey: ['shift-active', storeId],
    queryFn: () => fetch(`/api/shifts?storeId=${storeId}&active=true`).then(r => r.json()),
    refetchInterval: 30_000,
  })

  const { data: shifts = [], isLoading: loadingList } = useQuery<Shift[]>({
    queryKey: ['shifts', storeId],
    queryFn: () => fetch(`/api/shifts?storeId=${storeId}`).then(r => r.json()),
  })

  // Cash flow for active shift
  const openingAmt = activeShift?.openingCash ?? 0
  const salesCash = activeShift?.salesCash ?? (activeShift?.expectedCash != null ? activeShift.expectedCash - openingAmt : 0)
  const totalExpenses = activeShift?.totalExpenses ?? 0
  const expectedClosing = openingAmt + salesCash - totalExpenses
  const variance = denomTotal > 0 ? denomTotal - expectedClosing : null

  async function openShift() {
    setSaving(true)
    try {
      await fetch(`/api/shifts?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingCash: Number(openingCash ?? 0) }),
      })
      qc.invalidateQueries({ queryKey: ['shift-active'] })
      qc.invalidateQueries({ queryKey: ['shifts'] })
      setShowOpenForm(false)
      setOpeningCash('')
    } finally { setSaving(false) }
  }

  async function closeShift() {
    if (!activeShift) return
    setSaving(true)
    try {
      await fetch(`/api/shifts/${activeShift.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingCash: denomTotal, note: closeNote }),
      })
      qc.invalidateQueries({ queryKey: ['shift-active'] })
      qc.invalidateQueries({ queryKey: ['shifts'] })
      setShowCloseForm(false)
      setDenoms(Object.fromEntries(DENOMS.map(d => [d, ''])))
      setCloseNote('')
    } finally { setSaving(false) }
  }

  function printShiftReport(shift: Shift) {
    const open = shift.openingCash ?? 0
    const sales = shift.salesCash ?? ((shift.expectedCash ?? 0) - open)
    const exp = shift.totalExpenses ?? 0
    const expected = shift.expectedCash ?? (open + sales - exp)
    const actual = shift.closingCash ?? 0
    const diff = actual - expected

    printReceiptBrowser({
      storeName,
      orderNumber: `SHIFT-${shift.id.slice(-6).toUpperCase()}`,
      date: fmtTime(shift.openedAt),
      cashier: shift.userName ?? 'Kasir',
      items: [],
      subtotal: 0,
      total: actual,
      currency,
      receiptNote: `Laporan Shift · ${fmtTime(shift.openedAt)} – ${shift.closedAt ? fmtTime(shift.closedAt) : '—'}\n` +
        `Kas Awal: ${fmt(open, currency)}\n` +
        `Penjualan Kas: ${fmt(sales, currency)}\n` +
        `Pengeluaran: -${fmt(exp, currency)}\n` +
        `Ekspektasi: ${fmt(expected, currency)}\n` +
        `Aktual: ${fmt(actual, currency)}\n` +
        `Selisih: ${diff >= 0 ? '+' : ''}${fmt(diff, currency)}`,
    })
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5 pb-24 lg:pb-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Shift &amp; Kas</h1>
        <p className="text-stone-400 text-sm mt-0.5">Kelola shift kasir dan laporan kas harian</p>
      </div>

      {/* Active shift card */}
      {loadingActive ? (
        <div className="h-32 bg-[var(--bg-card)] border border-stone-100 rounded-2xl animate-pulse" />
      ) : activeShift ? (
        <div className="bg-[var(--bg-card)] border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-amber-50 px-5 py-3 flex items-center gap-3 border-b border-amber-100">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm font-semibold text-amber-700">Shift Sedang Berjalan</span>
            <span className="ml-auto text-xs text-amber-600">Dibuka {fmtTime(activeShift.openedAt)}</span>
          </div>

          {/* Cash flow summary */}
          <div className="p-5 space-y-3">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Ringkasan Arus Kas</p>
            <div className="bg-stone-50 rounded-xl p-4 space-y-2 border border-stone-100">
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Kas Awal</span>
                <span className="font-medium text-stone-700">{fmt(openingAmt, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">+ Penjualan (Tunai)</span>
                <span className="font-medium text-emerald-600">+{fmt(salesCash, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">- Pengeluaran</span>
                <span className="font-medium text-red-500">-{fmt(totalExpenses, currency)}</span>
              </div>
              <div className="border-t border-stone-200 pt-2 flex justify-between text-sm font-semibold">
                <span className="text-stone-700">Ekspektasi Kas Akhir</span>
                <span className="text-stone-800">{fmt(expectedClosing, currency)}</span>
              </div>
            </div>
          </div>

          {!showCloseForm ? (
            <div className="px-5 pb-5">
              <button
                onClick={() => setShowCloseForm(true)}
                className="w-full py-2.5 rounded-xl border-2 border-red-200 text-red-500 font-semibold text-sm hover:bg-red-50 transition-colors"
              >
                Tutup Shift
              </button>
            </div>
          ) : (
            <div className="px-5 pb-5 space-y-4 border-t border-stone-100 pt-4">
              <p className="text-sm font-semibold text-stone-700">Hitung Kas Penutupan</p>

              {/* Denomination counter */}
              <div className="bg-stone-50 rounded-xl border border-stone-100 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-stone-100 bg-[var(--bg-card)]">
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Hitung Lembar / Keping</p>
                </div>
                <div className="divide-y divide-stone-100">
                  {DENOMS.map(d => (
                    <div key={d} className="flex items-center gap-3 px-4 py-2">
                      <span className="text-sm text-stone-600 w-24 shrink-0">Rp {(d / 1000).toFixed(0)}K</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={denoms[d]}
                        onChange={e => setDenoms(prev => ({ ...prev, [d]: e.target.value }))}
                        className="w-20 bg-[var(--bg-card)] border border-stone-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
                      />
                      <ArrowRight className="h-3.5 w-3.5 text-stone-300 shrink-0" />
                      <span className="text-sm font-medium text-stone-700 ml-auto">
                        {fmt((Number(denoms[d]) || 0) * d, currency)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 flex justify-between items-center">
                  <span className="text-sm font-semibold text-amber-700">Total Kas Aktual</span>
                  <span className="text-base font-bold text-amber-800">{fmt(denomTotal, currency)}</span>
                </div>
              </div>

              {/* Variance display */}
              {denomTotal > 0 && (
                <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${
                  Math.abs(variance ?? 0) < 1000
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-600 border border-red-200'
                }`}>
                  {Math.abs(variance ?? 0) < 1000
                    ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                    : <AlertTriangle className="h-4 w-4 shrink-0" />}
                  <span>
                    Ekspektasi: {fmt(expectedClosing, currency)} · Aktual: {fmt(denomTotal, currency)}
                  </span>
                  <span className="ml-auto font-bold">
                    {(variance ?? 0) >= 0 ? '+' : ''}{fmt(variance ?? 0, currency)}
                  </span>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-stone-500 mb-1.5 block">Catatan (opsional)</label>
                <input value={closeNote} onChange={e => setCloseNote(e.target.value)} placeholder="Catatan penutupan shift..." className={inputCls} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCloseForm(false)} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50">Batal</button>
                <button onClick={closeShift} disabled={saving || denomTotal === 0} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-red-600 transition-colors">
                  {saving ? 'Menutup…' : 'Tutup Shift'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] border border-stone-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 rounded-full bg-stone-300" />
            <span className="text-sm text-stone-500">Tidak ada shift aktif</span>
          </div>
          {!showOpenForm ? (
            <button onClick={() => setShowOpenForm(true)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm shadow-md shadow-amber-200 hover:shadow-amber-300 transition-all">
              Buka Shift Baru
            </button>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-stone-500 mb-1.5 block">Kas Awal (Rp)</label>
                <input type="number" min="0" value={openingCash} onChange={e => setOpeningCash(e.target.value)}
                  placeholder="0" className={inputCls} autoFocus />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowOpenForm(false)} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50">Batal</button>
                <button onClick={openShift} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold disabled:opacity-50 transition-all">
                  {saving ? 'Membuka…' : 'Buka Shift'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shift history */}
      <div className="bg-[var(--bg-card)] border border-stone-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-4 py-3.5 border-b border-stone-100">
          <h2 className="text-sm font-semibold text-stone-800">Riwayat Shift</h2>
        </div>
        {loadingList ? (
          <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-stone-50 animate-pulse rounded-xl" />)}</div>
        ) : (shifts as Shift[]).filter(s => s.status === 'CLOSED').length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <Clock className="h-8 w-8 text-stone-200 mb-2" />
            <p className="text-sm text-stone-400">Belum ada shift selesai</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-50">
            {(shifts as Shift[]).filter(s => s.status === 'CLOSED').map(s => {
              const selisih = (s.closingCash ?? 0) - (s.expectedCash ?? 0)
              const ok = Math.abs(selisih) < 1000
              const expanded = expandedId === s.id
              return (
                <div key={s.id}>
                  <button
                    onClick={() => setExpandedId(expanded ? null : s.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors text-left"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-700">{fmtTime(s.openedAt)}</p>
                      <p className="text-xs text-stone-400">{s.userName ?? 'Kasir'} · {s.closedAt ? fmtTime(s.closedAt) : '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${ok ? 'text-emerald-600' : 'text-red-500'}`}>
                        {selisih >= 0 ? '+' : ''}{formatCurrency(selisih, currency)}
                      </p>
                      <p className="text-xs text-stone-400">selisih</p>
                    </div>
                    {expanded ? <ChevronUp className="h-4 w-4 text-stone-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-stone-400 shrink-0" />}
                  </button>
                  {expanded && (
                    <div className="px-4 pb-4 bg-stone-50 border-t border-stone-100">
                      <div className="grid grid-cols-3 gap-3 pt-3">
                        {[
                          { label: 'Kas Awal', value: formatCurrency(s.openingCash, currency) },
                          { label: 'Estimasi', value: formatCurrency(s.expectedCash ?? 0, currency) },
                          { label: 'Aktual', value: formatCurrency(s.closingCash ?? 0, currency) },
                        ].map(item => (
                          <div key={item.label} className="bg-[var(--bg-card)] rounded-xl p-3 border border-stone-100">
                            <p className="text-xs text-stone-400">{item.label}</p>
                            <p className="text-sm font-bold text-stone-800 mt-0.5">{item.value}</p>
                          </div>
                        ))}
                      </div>
                      {s.note && <p className="text-xs text-stone-500 mt-2 italic">&quot;{s.note}&quot;</p>}
                      <button
                        onClick={() => printShiftReport(s)}
                        className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl border border-stone-200 text-stone-600 text-xs font-medium hover:bg-[var(--bg-card)] hover:border-amber-300 hover:text-amber-700 transition-colors"
                      >
                        <Printer className="h-3.5 w-3.5" /> Cetak Laporan Shift
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
