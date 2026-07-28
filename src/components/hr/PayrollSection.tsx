'use client'

import { useState } from 'react'

interface PayrollSectionProps {
  storeId: string
  currency: string
  employees: any[]
}

export function PayrollSection({ storeId, currency, employees }: PayrollSectionProps) {
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [payroll, setPayroll] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [commissionMap, setCommissionMap] = useState<Record<string, number>>({})

  const generate = async () => {
    setLoading(true)
    const commRes = await fetch('/api/hr/commission/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, month, year }),
    })
    if (commRes.ok) {
      const commData = (await commRes.json()) as { data?: any[] }
      const map: Record<string, number> = {}
      for (const row of commData.data ?? []) {
        map[row.employeeId] = row.commissionEarned
      }
      setCommissionMap(map)
    }

    const res = await fetch('/api/hr/payroll/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, month, year }),
    })
    const data = (await res.json()) as { data?: any[] }
    setPayroll(data.data ?? [])
    setLoading(false)
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(n)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(2000, i).toLocaleString('id-ID', { month: 'long' })}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
        >
          {[2023, 2024, 2025, 2026].map(y => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          onClick={generate}
          disabled={loading}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {loading ? 'Menghitung…' : 'Generate Payroll'}
        </button>
        <a
          href="/dashboard/hr/commission"
          className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-600 hover:bg-amber-50"
        >
          Lihat Komisi →
        </a>
      </div>
      {payroll.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-muted)] text-xs text-[var(--text-2)]">
              <tr>
                {['Karyawan', 'Gaji Pokok', 'Komisi (Aturan)', 'Potongan', 'Gaji Bersih'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {payroll.map((row: any) => {
                const commission = commissionMap[row.employeeId] ?? row.commission ?? 0
                const netPay = Math.max(
                  0,
                  (row.baseSalary ?? 0) + commission - (row.deductions ?? row.totalDeductions ?? 0),
                )
                return (
                  <tr key={row.employeeId} className="hover:bg-[var(--bg-muted)]">
                    <td className="px-4 py-3 font-medium text-[var(--text-1)]">
                      {row.name ?? row.employeeName}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{fmt(row.baseSalary)}</td>
                    <td className="px-4 py-3 text-green-500">+{fmt(commission)}</td>
                    <td className="px-4 py-3 text-red-500">
                      -{fmt(row.deductions ?? row.totalDeductions ?? 0)}
                    </td>
                    <td className="px-4 py-3 font-bold text-[var(--text-1)]">{fmt(netPay)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
