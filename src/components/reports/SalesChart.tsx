'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  TooltipProps,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface DataPoint {
  date: string
  total: number
  orders: number
}

interface SalesChartProps {
  data: DataPoint[]
  currency: string
}

function CustomTooltip({ active, payload, label, currency }: TooltipProps<number, string> & { currency: string }) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-slate-900 border border-slate-600 rounded-lg p-3 shadow-xl">
      <p className="text-slate-400 text-xs mb-1.5">{label}</p>
      <p className="text-white font-semibold">
        {formatCurrency(payload[0]?.value ?? 0, currency)}
      </p>
      {payload[1] && (
        <p className="text-slate-400 text-xs mt-0.5">
          {payload[1].value} orders
        </p>
      )}
    </div>
  )
}

export function SalesChart({ data, currency }: SalesChartProps) {
  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        No sales data for this period
      </div>
    )
  }

  const formatted = data.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    total: Number(d.total),
  }))

  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={formatted} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#94a3b8', fontSize: 12 }}
          axisLine={{ stroke: '#475569' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#94a3b8', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCurrency(v, currency).replace(/[^0-9.,KMB]/g, '')}
          width={60}
        />
        <Tooltip content={<CustomTooltip currency={currency} />} />
        <Line
          type="monotone"
          dataKey="total"
          stroke="#6366f1"
          strokeWidth={2.5}
          dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#6366f1' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
