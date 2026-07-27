'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/utils'
import { Download } from 'lucide-react'

interface TrialBalanceClientProps { storeId: string; currency: string }

export default function TrialBalanceClient({ storeId, currency }: TrialBalanceClientProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [asOf, setAsOf] = useState(today)

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', storeId],
    queryFn: () => fetch(`/api/accounts?storeId=${storeId}`).then(r => r.json()),
  })

  const { data: bsRaw } = useQuery({
    queryKey: ['balance-sheet', storeId, asOf],
    queryFn: () => fetch(`/api/financial-reports/balance-sheet?storeId=${storeId}&to=${asOf}`).then(r => r.json()),
  })

  const bs = (bsRaw as any) ?? {}
  // Build flat trial balance from accounts + balance sheet data
  const rows = (accounts as any[]).map((acc: any) => {
    const bsAccounts = bs?.accounts ?? {}
    const bsAcc = Object.values(bsAccounts).flat().find((a: any) => a.name === acc.name) as any
    const balance = bsAcc?.balance ?? acc.balance ?? 0
    const isDebitNormal = ['ASSET', 'EXPENSE'].includes(acc.type)
    return {
      ...acc,
      debit: isDebitNormal && balance > 0 ? balance : 0,
      credit: !isDebitNormal && balance > 0 ? balance : 0,
    }
  })

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

  const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
  const sorted = [...rows].sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a.type); const bi = TYPE_ORDER.indexOf(b.type)
    if (ai !== bi) return ai - bi
    return a.code.localeCompare(b.code)
  })

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 pb-24 lg:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Neraca Saldo</h1>
          <p className="text-stone-400 text-sm mt-0.5">Trial balance</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-stone-200 text-stone-600 text-sm font-semibold rounded-xl shadow-sm hover:bg-stone-50">
          <Download className="h-4 w-4" /> Ekspor
        </button>
      </div>

      <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm flex items-center gap-4">
        <label className="text-xs font-semibold text-stone-500 shrink-0">Per tanggal</label>
        <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
          className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
        {!isBalanced && totalDebit > 0 && (
          <span className="text-xs font-semibold text-red-500 ml-auto">⚠ Tidak balance</span>
        )}
        {isBalanced && totalDebit > 0 && (
          <span className="text-xs font-semibold text-emerald-600 ml-auto">✓ Balance</span>
        )}
      </div>

      <div className="bg-white border border-stone-100 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-bold text-stone-500">Kode</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-stone-500">Nama Akun</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-stone-500">Tipe</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-stone-500">Debit</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-stone-500">Kredit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-stone-50 animate-pulse rounded" /></td></tr>
              ))
            ) : sorted.map((row: any) => (
              <tr key={row.id} className="hover:bg-stone-50/50">
                <td className="px-4 py-2.5 font-mono text-xs text-stone-500">{row.code}</td>
                <td className="px-4 py-2.5 text-stone-800">{row.name}</td>
                <td className="px-4 py-2.5 text-xs text-stone-400">{row.type}</td>
                <td className="px-4 py-2.5 text-right font-mono text-stone-700">
                  {row.debit > 0 ? formatCurrency(row.debit, currency) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-stone-700">
                  {row.credit > 0 ? formatCurrency(row.credit, currency) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-200 bg-stone-50">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-xs font-bold text-stone-700">TOTAL</td>
              <td className="px-4 py-3 text-right font-bold font-mono text-stone-800">{formatCurrency(totalDebit, currency)}</td>
              <td className="px-4 py-3 text-right font-bold font-mono text-stone-800">{formatCurrency(totalCredit, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
