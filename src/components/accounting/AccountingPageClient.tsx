'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DollarSign, TrendingUp, TrendingDown, Calendar, Download, FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface AccountingPageClientProps {
  storeId: string
  currency: string
}

export default function AccountingPageClient({ storeId, currency }: AccountingPageClientProps) {
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const lastDay = today.toISOString().slice(0, 10)

  const [from, setFrom] = useState(firstDay)
  const [to, setTo] = useState(lastDay)

  const { data: pnl, isLoading: pnlLoading } = useQuery({
    queryKey: ['pnl', storeId, from, to],
    queryFn: () => fetch(`/api/financial-reports/pnl?storeId=${storeId}&from=${from}&to=${to}`).then(r => r.json()),
  })

  const { data: balanceSheet, isLoading: bsLoading } = useQuery({
    queryKey: ['balance-sheet', storeId, to],
    queryFn: () => fetch(`/api/financial-reports/balance-sheet?storeId=${storeId}&to=${to}`).then(r => r.json()),
  })

  const netProfit = pnl?.netProfit ?? 0
  const totalAssets = balanceSheet?.totalAssets ?? 0
  const totalLiabilities = balanceSheet?.totalLiabilities ?? 0
  const totalEquity = balanceSheet?.totalEquity ?? 0

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Akuntansi & Laporan Keuangan</h1>
        <p className="text-stone-400 text-sm mt-0.5">Laba rugi, neraca, dan jurnal umum</p>
      </div>

      {/* Date Range */}
      <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Dari</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Sampai</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-xs font-medium text-stone-400">Pendapatan</p>
          </div>
          <p className="text-xl font-bold text-stone-800">
            {pnlLoading ? '...' : formatCurrency(pnl?.revenue ?? 0, currency)}
          </p>
        </div>

        <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-red-500" />
            </div>
            <p className="text-xs font-medium text-stone-400">Biaya</p>
          </div>
          <p className="text-xl font-bold text-red-500">
            {pnlLoading ? '...' : formatCurrency(pnl?.expenses ?? 0, currency)}
          </p>
        </div>

        <div className={`bg-white border rounded-2xl p-4 shadow-sm ${netProfit >= 0 ? 'border-emerald-200' : 'border-red-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <DollarSign className={`h-4 w-4 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`} />
            </div>
            <p className="text-xs font-medium text-stone-400">Laba Bersih</p>
          </div>
          <p className={`text-xl font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {pnlLoading ? '...' : formatCurrency(netProfit, currency)}
          </p>
        </div>

        <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
            <p className="text-xs font-medium text-stone-400">Total Aset</p>
          </div>
          <p className="text-xl font-bold text-stone-800">
            {bsLoading ? '...' : formatCurrency(totalAssets, currency)}
          </p>
        </div>
      </div>

      {/* P&L & Balance Sheet */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* P&L */}
        <div className="bg-white border border-stone-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-stone-800">Laba Rugi</h2>
            <button className="text-xs text-amber-500 font-semibold hover:text-amber-600 flex items-center gap-1">
              <Download className="h-3 w-3" /> Ekspor
            </button>
          </div>
          {pnlLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-stone-50 animate-pulse rounded-xl" />)}</div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between pb-2 border-b border-stone-100">
                <span className="font-semibold text-stone-700">Pendapatan</span>
                <span className="font-semibold text-emerald-600">{formatCurrency(pnl?.revenue ?? 0, currency)}</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-stone-100">
                <span className="font-semibold text-stone-700">Biaya</span>
                <span className="font-semibold text-red-500">({formatCurrency(pnl?.expenses ?? 0, currency)})</span>
              </div>
              <div className={`flex justify-between pt-2 border-t-2 ${netProfit >= 0 ? 'border-emerald-200' : 'border-red-200'}`}>
                <span className="font-bold text-stone-800">Laba Bersih</span>
                <span className={`font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {formatCurrency(netProfit, currency)}
                </span>
              </div>
              <p className="text-xs text-stone-400 pt-2">Periode: {from} s/d {to}</p>
            </div>
          )}
        </div>

        {/* Balance Sheet */}
        <div className="bg-white border border-stone-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-stone-800">Neraca</h2>
            <button className="text-xs text-amber-500 font-semibold hover:text-amber-600 flex items-center gap-1">
              <Download className="h-3 w-3" /> Ekspor
            </button>
          </div>
          {bsLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-stone-50 animate-pulse rounded-xl" />)}</div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between pb-2 border-b border-stone-100">
                <span className="font-semibold text-stone-700">Aset</span>
                <span className="font-semibold text-blue-600">{formatCurrency(totalAssets, currency)}</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-stone-100">
                <span className="font-semibold text-stone-700">Liabilitas</span>
                <span className="font-semibold text-orange-500">{formatCurrency(totalLiabilities, currency)}</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-stone-100">
                <span className="font-semibold text-stone-700">Ekuitas</span>
                <span className="font-semibold text-purple-600">{formatCurrency(totalEquity, currency)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t-2 border-stone-200">
                <span className="font-bold text-stone-800">Total Liabilitas + Ekuitas</span>
                <span className="font-bold text-stone-800">{formatCurrency(totalLiabilities + totalEquity, currency)}</span>
              </div>
              <p className="text-xs text-stone-400 pt-2">Per tanggal: {to}</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <a href="/dashboard/accounting/chart-of-accounts"
          className="flex items-center gap-3 bg-white border border-stone-100 rounded-2xl p-4 shadow-sm hover:border-amber-200 hover:bg-amber-50/30 transition-all">
          <FileText className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-stone-800">Chart of Accounts</p>
            <p className="text-xs text-stone-400">Daftar akun</p>
          </div>
        </a>
        <a href="/dashboard/accounting/journal"
          className="flex items-center gap-3 bg-white border border-stone-100 rounded-2xl p-4 shadow-sm hover:border-amber-200 hover:bg-amber-50/30 transition-all">
          <FileText className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-stone-800">Jurnal Umum</p>
            <p className="text-xs text-stone-400">Journal entries</p>
          </div>
        </a>
        <a href="/dashboard/accounting/trial-balance"
          className="flex items-center gap-3 bg-white border border-stone-100 rounded-2xl p-4 shadow-sm hover:border-amber-200 hover:bg-amber-50/30 transition-all">
          <FileText className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-stone-800">Neraca Saldo</p>
            <p className="text-xs text-stone-400">Trial balance</p>
          </div>
        </a>
      </div>
    </div>
  )
}
