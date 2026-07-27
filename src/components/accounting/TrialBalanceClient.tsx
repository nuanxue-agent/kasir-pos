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
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Neraca Saldo</h1>
          <p className="text-[var(--text-3)] text-sm mt-0.5">Trial balance</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-2)] text-sm font-semibold rounded-xl shadow-sm hover:bg-[var(--bg-subtle)]">
          <Download className="h-4 w-4" /> Ekspor
        </button>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm flex items-center gap-4">
        <label className="text-xs font-semibold text-[var(--text-2)] shrink-0">Per tanggal</label>
        <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
          className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
        {!isBalanced && totalDebit > 0 && (
          <span className="text-xs font-semibold text-red-500 ml-auto">⚠ Tidak balance</span>
        )}
        {isBalanced && totalDebit > 0 && (
          <span className="text-xs font-semibold text-emerald-600 ml-auto">✓ Balance</span>
        )}
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border)]">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-2)]">Kode</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-2)]">Nama Akun</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-2)]">Tipe</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-2)]">Debit</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-2)]">Kredit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-[var(--bg-subtle)] animate-pulse rounded" /></td></tr>
              ))
            ) : sorted.map((row: any) => (
              <tr key={row.id} className="hover:bg-[var(--bg-subtle)]/50">
                <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-2)]">{row.code}</td>
                <td className="px-4 py-2.5 text-[var(--text-1)]">{row.name}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--text-3)]">{row.type}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[var(--text-1)]">
                  {row.debit > 0 ? formatCurrency(row.debit, currency) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[var(--text-1)]">
                  {row.credit > 0 ? formatCurrency(row.credit, currency) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--border)] bg-[var(--bg-subtle)]">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-xs font-bold text-[var(--text-1)]">TOTAL</td>
              <td className="px-4 py-3 text-right font-bold font-mono text-[var(--text-1)]">{formatCurrency(totalDebit, currency)}</td>
              <td className="px-4 py-3 text-right font-bold font-mono text-[var(--text-1)]">{formatCurrency(totalCredit, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
