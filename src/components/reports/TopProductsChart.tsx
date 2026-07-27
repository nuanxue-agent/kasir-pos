'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface ProductData {
  productId: string
  name: string
  _sum: { subtotal: number; qty: number }
}

interface TopProductsChartProps {
  data: ProductData[]
  currency: string
}

const BAR_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']

function truncate(name: string, maxLen = 20) {
  return name.length > maxLen ? name.slice(0, maxLen) + '…' : name
}

export function TopProductsChart({ data, currency }: TopProductsChartProps) {
  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        No product data for this period
      </div>
    )
  }

  const formatted = data.map((d) => ({
    name: truncate(d.name),
    revenue: Number(d._sum.subtotal),
    qty: Number(d._sum.qty),
  }))

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart
        data={formatted}
        layout="vertical"
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => {
            if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
            if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
            return String(v)
          }}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: '#94a3b8', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={90}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#0f172a',
            border: '1px solid #475569',
            borderRadius: '8px',
            color: '#fff',
          }}
          labelStyle={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}
          formatter={(value: number, _name: string, entry: { payload?: { qty?: number } }) => [
            formatCurrency(value, currency),
            `Revenue (${entry.payload?.qty ?? 0} units)`,
          ]}
          cursor={{ fill: '#1e293b' }}
        />
        <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
          {formatted.map((_, index) => (
            <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
