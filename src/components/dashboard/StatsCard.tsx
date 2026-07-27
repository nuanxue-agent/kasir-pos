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
  /** Legacy prop alias for color */
  variant?: ColorVariant
  trend?: number
  /** Change percentage — alias for trend */
  change?: number
  loading?: boolean
}

const variantStyles: Record<ColorVariant, {
  iconBg: string
  iconText: string
  glow: string
  border: string
}> = {
  green: {
    iconBg: 'bg-emerald-500/15',
    iconText: 'text-emerald-400',
    glow: 'shadow-emerald-500/5',
    border: 'hover:border-emerald-500/20',
  },
  blue: {
    iconBg: 'bg-blue-500/15',
    iconText: 'text-blue-400',
    glow: 'shadow-blue-500/5',
    border: 'hover:border-blue-500/20',
  },
  purple: {
    iconBg: 'bg-indigo-500/15',
    iconText: 'text-indigo-400',
    glow: 'shadow-indigo-500/5',
    border: 'hover:border-indigo-500/20',
  },
  orange: {
    iconBg: 'bg-orange-500/15',
    iconText: 'text-orange-400',
    glow: 'shadow-orange-500/5',
    border: 'hover:border-orange-500/20',
  },
}

export function StatsCard({
  icon: Icon,
  label,
  value,
  color,
  variant,
  trend,
  change,
  loading = false,
}: StatsCardProps) {
  const resolvedVariant: ColorVariant = color ?? variant ?? 'blue'
  const { iconBg, iconText, glow, border } = variantStyles[resolvedVariant]
  const delta = trend ?? change

  const isUp   = delta !== undefined && delta > 0
  const isDown = delta !== undefined && delta < 0

  if (loading) {
    return (
      <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-5 animate-pulse">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/10 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3 bg-white/10 rounded w-2/3" />
            <div className="h-7 bg-white/10 rounded w-1/2" />
            <div className="h-3 bg-white/10 rounded w-1/3" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-5',
        'shadow-lg transition-all duration-200',
        `hover:bg-white/[0.07] ${border}`,
        glow
      )}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={cn('rounded-xl p-2.5 shrink-0', iconBg)}>
          <Icon className={cn('h-5 w-5', iconText)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white/50 truncate">{label}</p>
          <p className="text-2xl font-bold text-white mt-1 truncate leading-none">{value}</p>

          {/* Trend indicator */}
          {delta !== undefined && (
            <div
              className={cn(
                'flex items-center gap-1 mt-2 text-xs font-medium',
                isUp   && 'text-emerald-400',
                isDown && 'text-red-400',
                !isUp && !isDown && 'text-white/30'
              )}
            >
              {isUp   && <TrendingUp  className="h-3 w-3" />}
              {isDown && <TrendingDown className="h-3 w-3" />}
              {!isUp && !isDown && <Minus className="h-3 w-3" />}
              <span>
                {delta === 0
                  ? 'No change'
                  : `${isUp ? '+' : ''}${delta.toFixed(1)}% vs yesterday`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
