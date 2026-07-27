'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/utils'
import { ExportButton } from '@/components/ExportButton'
import type { ExportColumn } from '@/lib/export'
import { CheckCircle, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'

interface BalanceSheetClientProps {
  storeId: string
  currency: string
}

interface BSAccount {
  name: string
  code: string
  balance: number
}

interface BalanceSheetData {
  accounts: {
    assets: BSAccount[]
    liabilities: BSAccount[]
    equity: BSAccount[]
  }
  totals: {
    assets: number
    liabilities: number
    equity: number
  }
  isBalanced: boolean
}

const BS_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'section', label: 'Seksi' },
  { key: 'code', label: 'Kode' },
  { key: 'name', label: 'Nama Akun' },
  { key: 'balance', label: 'Saldo' },
]

function SectionTable({
  title,
  accounts,
  total,
  currency,
  accentClass,
}: {
  title: string
  accounts: BSAccount[]
  total: number
  currency: string
  accentClass: string
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--bg-subtle)]/60 transition-colors"
        aria-expanded={open}
      >
        <span className={`text-sm font-bold uppercase tracking-wide ${accentClass}`}>{title}</span>
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-[var(--text-1)]">{formatCurrency(total, currency)}</span>
          {open ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-3)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-3)]" />
          )}
        </div>
      </button>
      {open && (
        <div className="border-t border-[var(--border)]">
          {accounts.length === 0 ? (
            <p className="px-5 py-4 text-sm text-[var(--text-3)] italic">Tidak ada akun</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-subtle)]">
                <tr>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-[var(--text-3)]">Kode</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-[var(--text-3)]">Nama Akun</th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-[var(--text-3)]">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {accounts.map((acc, i) => (
                  <tr key={acc.code ?? i} className="hover:bg-[var(--bg-subtle)]/50">
                    <td className="px-5 py-2.5 font-mono text-xs text-[var(--text-3)]">{acc.code}</td>
                    <td className="px-5 py-2.5 text-[var(--text-1)]">{acc.name}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-[var(--text-1)]">
                      {formatCurrency(acc.balance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-[var(--border)] bg-[var(--bg-subtle)]/70">
                <tr>
                  <td colSpan={2} className="px-5 py-2.5 text-xs font-bold text-[var(--text-2)]">
                    Total {title}
                  </td>
                  <td className="px-5 py-2.5 text-right font-bold font-mono text-[var(--text-1)]">
                    {formatCurrency(total, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

export function BalanceSheetClient({ storeId, currency }: BalanceSheetClientProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [asOf, setAsOf] = useState(today)

  const { data, isLoading } = useQuery<BalanceSheetData>({
    queryKey: ['balance-sheet', storeId, asOf],
    queryFn: async () => {
      const res = await fetch(`/api/financial-reports/balance-sheet?storeId=${storeId}&to=${asOf}`)
      if (!res.ok) throw new Error('Failed to fetch balance sheet')
      return res.json()
    },
  })

  const assets = data?.accounts?.assets ?? []
  const liabilities = data?.accounts?.liabilities ?? []
  const equity = data?.accounts?.equity ?? []
  const totalAssets = data?.totals?.assets ?? 0
  const totalLiabilities = data?.totals?.liabilities ?? 0
  const totalEquity = data?.totals?.equity ?? 0
  const isBalanced = data?.isBalanced ?? (Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01)

  const exportRows: Record<string, unknown>[] = [
    ...assets.map(a => ({ section: 'Aset', code: a.code, name: a.name, balance: a.balance })),
    { section: 'TOTAL ASET', code: '', name: '', balance: totalAssets },
    ...liabilities.map(a => ({ section: 'Kewajiban', code: a.code, name: a.name, balance: a.balance })),
    { section: 'TOTAL KEWAJIBAN', code: '', name: '', balance: totalLiabilities },
    ...equity.map(a => ({ section: 'Ekuitas', code: a.code, name: a.name, balance: a.balance })),
    { section: 'TOTAL EKUITAS', code: '', name: '', balance: totalEquity },
  ]

  const skeleton = () => (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-3 animate-pulse">
      <div className="h-4 bg-[var(--bg-muted)] rounded w-1/4" />
      <div className="h-3 bg-[var(--bg-subtle)] rounded w-full" />
      <div className="h-3 bg-[var(--bg-subtle)] rounded w-5/6" />
      <div className="h-3 bg-[var(--bg-subtle)] rounded w-4/6" />
    </div>
  )

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-1)]">Neraca</h1>
        <p className="text-[var(--text-3)] text-sm mt-0.5">Balance sheet — posisi keuangan per tanggal tertentu</p>
      </div>

      {/* Controls */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2">
          <span className="text-xs font-semibold text-[var(--text-3)] shrink-0">Per tanggal</span>
          <input
            type="date"
            value={asOf}
            onChange={e => setAsOf(e.target.value)}
            className="text-sm text-[var(--text-1)] bg-transparent focus:outline-none"
            aria-label="Tanggal neraca"
          />
        </div>

        {!isLoading && totalAssets > 0 && (
          <div className={`flex items-center gap-1.5 text-xs font-semibold ml-auto ${isBalanced ? 'text-emerald-600' : 'text-red-500'}`}>
            {isBalanced ? (
              <><CheckCircle className="h-4 w-4" /> Neraca Balance</>
            ) : (
              <><AlertTriangle className="h-4 w-4" /> Tidak Balance</>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <ExportButton
            type="pdf"
            label="PDF"
            data={exportRows}
            columns={BS_EXPORT_COLUMNS}
            filename={`neraca-${asOf}`}
            title={`Neraca per ${asOf}`}
            currency={currency}
          />
          <ExportButton
            type="excel"
            label="Excel"
            data={exportRows}
            columns={BS_EXPORT_COLUMNS}
            filename={`neraca-${asOf}`}
            title={`Neraca per ${asOf}`}
            currency={currency}
          />
        </div>
      </div>

      {/* Equation summary */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
            <p className="text-xs font-semibold text-amber-600 mb-1">Total Aset</p>
            <p className="text-lg font-bold text-[var(--text-1)]">{formatCurrency(totalAssets, currency)}</p>
          </div>
          <div className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl p-4 text-center">
            <p className="text-xs font-semibold text-[var(--text-2)] mb-1">Total Kewajiban</p>
            <p className="text-lg font-bold text-[var(--text-1)]">{formatCurrency(totalLiabilities, currency)}</p>
          </div>
          <div className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl p-4 text-center">
            <p className="text-xs font-semibold text-[var(--text-2)] mb-1">Total Ekuitas</p>
            <p className="text-lg font-bold text-[var(--text-1)]">{formatCurrency(totalEquity, currency)}</p>
          </div>
        </div>
      )}

      {/* Sections */}
      {isLoading ? (
        <>{skeleton()}{skeleton()}{skeleton()}</>
      ) : (
        <>
          <SectionTable
            title="Aset"
            accounts={assets}
            total={totalAssets}
            currency={currency}
            accentClass="text-amber-600"
          />
          <SectionTable
            title="Kewajiban"
            accounts={liabilities}
            total={totalLiabilities}
            currency={currency}
            accentClass="text-[var(--text-2)]"
          />
          <SectionTable
            title="Ekuitas"
            accounts={equity}
            total={totalEquity}
            currency={currency}
            accentClass="text-[var(--text-2)]"
          />

          {/* Equation check footer */}
          <div className={`rounded-xl border p-4 flex items-center justify-between text-sm font-semibold ${
            isBalanced
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-600'
          }`}>
            <span>Aset = Kewajiban + Ekuitas</span>
            <span>
              {formatCurrency(totalAssets, currency)} = {formatCurrency(totalLiabilities + totalEquity, currency)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
