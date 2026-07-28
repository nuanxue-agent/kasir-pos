'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/utils'
import {
  Building2,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Plus,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransferType = 'STOCK' | 'CASH'
export type TransferStatus = 'PENDING' | 'COMPLETED'

export interface InterCompanyTransfer {
  id: string
  fromStoreId: string
  fromStoreName?: string
  toStoreId: string
  toStoreName?: string
  type: TransferType
  amount: number
  productId?: string | null
  productName?: string | null
  qty?: number | null
  status: TransferStatus
  createdAt: string
}

export interface StoreConsolidated {
  storeId: string
  storeName: string
  revenue: number
  cogs: number
  grossProfit: number
  operatingExpenses: number
  netProfit: number
  intercompanyRevenue: number  // inbound transfers to eliminate
  intercompanyCost: number     // outbound transfers to eliminate
}

export interface ConsolidatedPnL {
  groupId: string
  from: string
  to: string
  stores: StoreConsolidated[]
  eliminations: {
    intercompanyRevenue: number
    intercompanyCost: number
  }
  minorityInterest: number
  consolidated: {
    revenue: number
    cogs: number
    grossProfit: number
    operatingExpenses: number
    netProfit: number
    minorityInterest: number
    netProfitAttributableToParent: number
  }
  generatedAt: string
}

type PeriodType = 'month' | 'quarter' | 'year' | 'custom'

interface ConsolidationClientProps {
  storeId: string
  currency: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPeriodRange(period: PeriodType, customFrom: string, customTo: string) {
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
    default:
      return { from: customFrom, to: customTo }
  }
}

function statusBadge(status: TransferStatus) {
  if (status === 'COMPLETED')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle className="h-3 w-3" />
        Selesai
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
      <Clock className="h-3 w-3" />
      Menunggu
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ConsolidationClient({ storeId, currency }: ConsolidationClientProps) {
  const qc = useQueryClient()
  const [period, setPeriod] = useState<PeriodType>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [tab, setTab] = useState<'pnl' | 'transfers'>('pnl')
  const [showNewTransfer, setShowNewTransfer] = useState(false)

  // New transfer form state
  const [tfForm, setTfForm] = useState({
    fromStoreId: storeId,
    toStoreId: '',
    type: 'CASH' as TransferType,
    amount: '',
    productId: '',
    qty: '',
  })

  const { from, to } = getPeriodRange(period, customFrom, customTo)

  // ── Consolidated P&L ──────────────────────────────────────────────────────
  const pnlQuery = useQuery<ConsolidatedPnL>({
    queryKey: ['consolidated-pnl', storeId, from, to],
    queryFn: async () => {
      const res = await fetch(
        `/api/reports/consolidated-pnl?groupId=${storeId}&from=${from}&to=${to}`,
      )
      if (!res.ok) throw new Error('Gagal memuat laporan konsolidasi')
      return res.json()
    },
    enabled: tab === 'pnl',
  })

  // ── Inter-company transfers ───────────────────────────────────────────────
  const transfersQuery = useQuery<{ transfers: InterCompanyTransfer[] }>({
    queryKey: ['intercompany-transfers', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intercompany-transfers?storeId=${storeId}`)
      if (!res.ok) throw new Error('Gagal memuat transfer antar perusahaan')
      return res.json()
    },
    enabled: tab === 'transfers',
  })

  // ── Create transfer ───────────────────────────────────────────────────────
  const createTransfer = useMutation({
    mutationFn: async (body: typeof tfForm) => {
      const res = await fetch('/api/intercompany-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          amount: Number(body.amount),
          qty: body.qty ? Number(body.qty) : null,
          productId: body.productId || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Gagal membuat transfer')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intercompany-transfers'] })
      setShowNewTransfer(false)
      setTfForm({ fromStoreId: storeId, toStoreId: '', type: 'CASH', amount: '', productId: '', qty: '' })
    },
  })

  // ── Complete transfer ─────────────────────────────────────────────────────
  const completeTransfer = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/intercompany-transfers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      })
      if (!res.ok) throw new Error('Gagal menyelesaikan transfer')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intercompany-transfers'] })
      qc.invalidateQueries({ queryKey: ['consolidated-pnl'] })
    },
  })

  const fmt = (n: number) => formatCurrency(n, currency)
  const pnl = pnlQuery.data
  const c = pnl?.consolidated
  const transfers = transfersQuery.data?.transfers ?? []

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Konsolidasi</h1>
          <p className="mt-1 text-sm text-gray-500">
            Laba/Rugi konsolidasi grup & transfer antar perusahaan
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <select
            value={period}
            onChange={e => setPeriod(e.target.value as PeriodType)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="month">Bulan Ini</option>
            <option value="quarter">Kuartal Ini</option>
            <option value="year">Tahun Ini</option>
            <option value="custom">Kustom</option>
          </select>
          {period === 'custom' && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm"
              />
              <span className="text-gray-400">–</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm"
              />
            </>
          )}
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['consolidated-pnl'] })
              qc.invalidateQueries({ queryKey: ['intercompany-transfers'] })
            }}
            className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {[
            { id: 'pnl', label: 'L/R Konsolidasi', icon: TrendingUp },
            { id: 'transfers', label: 'Transfer Antar Toko', icon: ArrowRightLeft },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as typeof tab)}
              className={[
                'flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors',
                tab === id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── P&L Tab ─────────────────────────────────────────────────────────── */}
      {tab === 'pnl' && (
        <div className="space-y-6">
          {pnlQuery.isLoading && (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          )}
          {pnlQuery.isError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {(pnlQuery.error as Error).message}
            </div>
          )}
          {c && (
            <>
              {/* Consolidated summary cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: 'Total Pendapatan', value: c.revenue, positive: true },
                  { label: 'Laba Kotor', value: c.grossProfit, positive: c.grossProfit >= 0 },
                  { label: 'Beban Operasional', value: c.operatingExpenses, positive: false },
                  { label: 'Laba Bersih (Grup)', value: c.netProfitAttributableToParent, positive: c.netProfitAttributableToParent >= 0 },
                ].map(({ label, value, positive }) => (
                  <div key={label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className={['mt-1 text-lg font-bold', positive ? 'text-gray-900' : 'text-red-600'].join(' ')}>
                      {fmt(value)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Elimination entries */}
              <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-orange-800">Eliminasi Antar Perusahaan</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-orange-700">Pendapatan dieliminasi:</span>
                    <span className="ml-2 font-medium text-orange-900">
                      ({fmt(pnl.eliminations.intercompanyRevenue)})
                    </span>
                  </div>
                  <div>
                    <span className="text-orange-700">Biaya dieliminasi:</span>
                    <span className="ml-2 font-medium text-orange-900">
                      ({fmt(pnl.eliminations.intercompanyCost)})
                    </span>
                  </div>
                </div>
              </div>

              {/* Minority interest stub */}
              {c.minorityInterest !== 0 && (
                <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
                  <h3 className="mb-1 text-sm font-semibold text-purple-800">Kepentingan Non-Pengendali</h3>
                  <p className="text-sm text-purple-700">
                    Porsi laba yang diatribusikan ke pemegang saham minoritas:{' '}
                    <span className="font-medium">{fmt(c.minorityInterest)}</span>
                  </p>
                </div>
              )}

              {/* Per-store breakdown */}
              <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-700">Rincian Per Toko</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {pnl.stores.map(s => (
                    <div key={s.storeId} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                      <div className="flex min-w-[160px] items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <span className="font-medium text-gray-800">{s.storeName}</span>
                      </div>
                      <div className="ml-auto flex flex-wrap gap-6 text-right">
                        <div>
                          <p className="text-xs text-gray-400">Pendapatan</p>
                          <p className="font-medium">{fmt(s.revenue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Laba Kotor</p>
                          <p className={['font-medium', s.grossProfit < 0 ? 'text-red-600' : ''].join(' ')}>
                            {fmt(s.grossProfit)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Laba Bersih</p>
                          <p className={['font-medium', s.netProfit < 0 ? 'text-red-600' : ''].join(' ')}>
                            {fmt(s.netProfit)}
                          </p>
                        </div>
                        {s.intercompanyRevenue > 0 && (
                          <div>
                            <p className="text-xs text-orange-400">IC Revenue</p>
                            <p className="font-medium text-orange-600">({fmt(s.intercompanyRevenue)})</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Consolidated P&L statement */}
              <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-700">Laporan L/R Konsolidasi</h3>
                  <p className="text-xs text-gray-400">{from} s.d. {to}</p>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      { label: 'Pendapatan Bersih', value: c.revenue, bold: false },
                      { label: 'Harga Pokok Penjualan', value: -c.cogs, bold: false },
                      { label: 'Laba Kotor', value: c.grossProfit, bold: true },
                      { label: 'Beban Operasional', value: -c.operatingExpenses, bold: false },
                      { label: 'Laba Usaha', value: c.grossProfit - c.operatingExpenses, bold: true },
                      { label: 'Kepentingan Non-Pengendali', value: -c.minorityInterest, bold: false },
                      { label: 'Laba Bersih – Entitas Induk', value: c.netProfitAttributableToParent, bold: true },
                    ].map(({ label, value, bold }) => (
                      <tr key={label} className={bold ? 'bg-gray-50 font-semibold' : ''}>
                        <td className="px-4 py-2 text-gray-700">{label}</td>
                        <td className={['px-4 py-2 text-right', value < 0 ? 'text-red-600' : 'text-gray-900'].join(' ')}>
                          {value < 0 ? `(${fmt(Math.abs(value))})` : fmt(value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Transfers Tab ────────────────────────────────────────────────────── */}
      {tab === 'transfers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">Transfer Antar Toko</h2>
            <button
              onClick={() => setShowNewTransfer(v => !v)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Transfer Baru
            </button>
          </div>

          {/* New transfer form */}
          {showNewTransfer && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <h3 className="mb-4 text-sm font-semibold text-blue-800">Transfer Baru</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs text-gray-600">Tipe</label>
                  <select
                    value={tfForm.type}
                    onChange={e => setTfForm(f => ({ ...f, type: e.target.value as TransferType }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="CASH">Kas</option>
                    <option value="STOCK">Stok</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">Toko Tujuan (ID)</label>
                  <input
                    type="text"
                    value={tfForm.toStoreId}
                    onChange={e => setTfForm(f => ({ ...f, toStoreId: e.target.value }))}
                    placeholder="store_xxx"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">Jumlah (Rp)</label>
                  <input
                    type="number"
                    value={tfForm.amount}
                    onChange={e => setTfForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    min="0"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                {tfForm.type === 'STOCK' && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">ID Produk</label>
                      <input
                        type="text"
                        value={tfForm.productId}
                        onChange={e => setTfForm(f => ({ ...f, productId: e.target.value }))}
                        placeholder="prod_xxx"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">Qty</label>
                      <input
                        type="number"
                        value={tfForm.qty}
                        onChange={e => setTfForm(f => ({ ...f, qty: e.target.value }))}
                        placeholder="0"
                        min="1"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => createTransfer.mutate(tfForm)}
                  disabled={createTransfer.isPending || !tfForm.toStoreId || !tfForm.amount}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {createTransfer.isPending ? 'Menyimpan...' : 'Simpan'}
                </button>
                <button
                  onClick={() => setShowNewTransfer(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Batal
                </button>
              </div>
              {createTransfer.isError && (
                <p className="mt-2 text-xs text-red-600">{(createTransfer.error as Error).message}</p>
              )}
            </div>
          )}

          {/* Transfers list */}
          {transfersQuery.isLoading && (
            <div className="flex justify-center py-10">
              <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
            </div>
          )}
          {transfers.length === 0 && !transfersQuery.isLoading && (
            <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
              Belum ada transfer antar toko
            </div>
          )}
          {transfers.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500">
                    <th className="px-4 py-3 text-left">Dari</th>
                    <th className="px-4 py-3 text-left">Ke</th>
                    <th className="px-4 py-3 text-left">Tipe</th>
                    <th className="px-4 py-3 text-right">Jumlah</th>
                    <th className="px-4 py-3 text-left">Produk</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Tanggal</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transfers.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{t.fromStoreName ?? t.fromStoreId}</td>
                      <td className="px-4 py-3 text-gray-700">{t.toStoreName ?? t.toStoreId}</td>
                      <td className="px-4 py-3">
                        <span className={[
                          'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                          t.type === 'CASH'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-700',
                        ].join(' ')}>
                          {t.type === 'CASH' ? 'Kas' : 'Stok'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(t.amount)}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {t.productName ?? (t.productId ? t.productId : '–')}
                        {t.qty ? ` ×${t.qty}` : ''}
                      </td>
                      <td className="px-4 py-3">{statusBadge(t.status)}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {new Date(t.createdAt).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-4 py-3">
                        {t.status === 'PENDING' && (
                          <button
                            onClick={() => completeTransfer.mutate(t.id)}
                            disabled={completeTransfer.isPending}
                            className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            Selesai
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
