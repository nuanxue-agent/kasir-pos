'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

type ColorVariant = 'green' | 'blue' | 'purple' | 'orange'

interface StatsCardProps {
  icon: LucideIcon
  label: string
  value: string
  color?: ColorVariant
  variant?: ColorVariant
  trend?: number
  change?: number
  loading?: boolean
  sub?: string
}

const variantStyles: Record<ColorVariant, { iconBg: string; iconText: string; accent: string }> = {
  green:  { iconBg: 'bg-emerald-50',  iconText: 'text-emerald-600', accent: 'text-emerald-600' },
  blue:   { iconBg: 'bg-sky-50',      iconText: 'text-sky-600',     accent: 'text-sky-600' },
  purple: { iconBg: 'bg-amber-50',    iconText: 'text-amber-600',   accent: 'text-amber-600' },
  orange: { iconBg: 'bg-orange-50',   iconText: 'text-orange-600',  accent: 'text-orange-600' },
}

export function StatsCard({ icon: Icon, label, value, color, variant, trend, change, loading = false, sub }: StatsCardProps) {
  const resolvedVariant: ColorVariant = color ?? variant ?? 'blue'
  const { iconBg, iconText, accent } = variantStyles[resolvedVariant]
  const delta = trend ?? change

  const isUp   = delta !== undefined && delta > 0
  const isDown = delta !== undefined && delta < 0

  if (loading) {
    return (
      <div className="bg-white border border-stone-100 rounded-2xl p-4 animate-pulse shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-stone-100 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-2.5 bg-stone-100 rounded w-2/3" />
            <div className="h-6 bg-stone-100 rounded w-1/2" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-stone-200 transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className={cn('rounded-xl p-2 shrink-0', iconBg)}>
          <Icon className={cn('h-4 w-4', iconText)} />
        </div>
        {delta !== undefined && (
          <div className={cn(
            'flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0',
            isUp   && 'bg-emerald-50 text-emerald-600',
            isDown && 'bg-red-50 text-red-500',
            !isUp && !isDown && 'bg-stone-100 text-stone-400'
          )}>
            {isUp   && <TrendingUp  className="h-2.5 w-2.5" />}
            {isDown && <TrendingDown className="h-2.5 w-2.5" />}
            {!isUp && !isDown && <Minus className="h-2.5 w-2.5" />}
            {delta === 0 ? '0%' : `${isUp ? '+' : ''}${delta.toFixed(0)}%`}
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-xs font-medium text-stone-400 truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-stone-800 mt-0.5 leading-none truncate">{value}</p>
        {sub && <p className="text-xs text-stone-400 mt-1.5">{sub}</p>}
      </div>
    </div>
  )
}
