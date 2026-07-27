'use client'

import { formatCurrency } from '@/lib/utils'

interface PaymentBreakdownProps {
  data: Array<{
    method: string
    _sum: { amount: number }
    _count: { id: number }
  }>
  currency: string
}

const METHOD_STYLES: Record<string, { label: string; color: string; bg: string; text: string }> = {
  CASH:     { label: 'Cash',     color: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  CARD:     { label: 'Card',     color: 'bg-blue-500',    bg: 'bg-blue-500/10',    text: 'text-blue-400'    },
  QRIS:     { label: 'QRIS',     color: 'bg-purple-500',  bg: 'bg-purple-500/10',  text: 'text-purple-400'  },
  TRANSFER: { label: 'Transfer', color: 'bg-orange-500',  bg: 'bg-orange-500/10',  text: 'text-orange-400'  },
}

const DEFAULT_STYLE = { label: 'Other', color: 'bg-slate-500', bg: 'bg-slate-500/10', text: 'text-slate-400' }

export function PaymentBreakdown({ data, currency }: PaymentBreakdownProps) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
        No payment data for this period
      </div>
    )
  }

  const total = data.reduce((sum, d) => sum + Number(d._sum.amount), 0)

  const sorted = [...data].sort((a, b) => Number(b._sum.amount) - Number(a._sum.amount))

  return (
    <div className="space-y-4">
      {sorted.map((item) => {
        const style = METHOD_STYLES[item.method.toUpperCase()] ?? DEFAULT_STYLE
        const amount = Number(item._sum.amount)
        const pct = total > 0 ? Math.round((amount / total) * 100) : 0

        return (
          <div key={item.method}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center justify-center text-xs font-medium px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}>
                  {style.label}
                </span>
                <span className="text-slate-400 text-sm">{item._count.id} txn{item._count.id !== 1 ? 's' : ''}</span>
              </div>
              <div className="text-right">
                <span className="text-white font-medium text-sm">{formatCurrency(amount, currency)}</span>
                <span className="text-slate-500 text-xs ml-2">{pct}%</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${style.color} rounded-full transition-all duration-500`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}

      {/* Total */}
      <div className="pt-3 mt-3 border-t border-slate-700 flex items-center justify-between">
        <span className="text-slate-400 text-sm">Total</span>
        <span className="text-white font-semibold">{formatCurrency(total, currency)}</span>
      </div>
    </div>
  )
}
