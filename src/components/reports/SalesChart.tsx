'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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

export function SalesChart({ data, currency }: SalesChartProps) {
  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-stone-500 text-sm">
        No sales data for this period
      </div>
    )
  }

  const formatted = data.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    total: Number(d.total),
    orders: Number(d.orders),
  }))

  // Closed-over tooltip — avoids passing extra props to Recharts Tooltip
  function TooltipContent(props: Record<string, unknown>) {
    const active = props.active as boolean | undefined
    const payload = props.payload as Array<{ value: number; payload: { orders: number } }> | undefined
    const label = props.label as string | undefined
    if (!active || !payload?.length) return null
    return (
      <div className="bg-white border border-stone-200 rounded-lg p-3 shadow-xl">
        <p className="text-stone-500 text-xs mb-1.5">{label}</p>
        <p className="text-stone-800 font-semibold">{formatCurrency(payload[0].value, currency)}</p>
        <p className="text-stone-500 text-xs mt-0.5">{payload[0].payload.orders} orders</p>
      </div>
    )
  }

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
          tickFormatter={(v: number) => {
            if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
            if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
            return String(v)
          }}
          width={60}
        />
        <Tooltip content={TooltipContent} />
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
