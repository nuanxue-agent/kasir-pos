'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

type ColorVariant = 'green' | 'blue' | 'purple' | 'orange'

interface StatsCardProps {
  icon: LucideIcon
  label: string
  value: string
  /** Change percentage vs yesterday — positive = up, negative = down, undefined = no data */
  change?: number
  variant?: ColorVariant
}

const variantStyles: Record<ColorVariant, { iconBg: string; iconText: string }> = {
  green:  { iconBg: 'bg-emerald-100', iconText: 'text-emerald-600' },
  blue:   { iconBg: 'bg-blue-100',    iconText: 'text-blue-600' },
  purple: { iconBg: 'bg-indigo-100',  iconText: 'text-indigo-600' },
  orange: { iconBg: 'bg-orange-100',  iconText: 'text-orange-600' },
}

export function StatsCard({
  icon: Icon,
  label,
  value,
  change,
  variant = 'blue',
}: StatsCardProps) {
  const { iconBg, iconText } = variantStyles[variant]

  const isUp   = change !== undefined && change > 0
  const isDown = change !== undefined && change < 0

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      {/* Icon */}
      <div className={cn('rounded-lg p-2.5 shrink-0', iconBg)}>
        <Icon className={cn('h-5 w-5', iconText)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 truncate">{label}</p>
        <p className="text-2xl font-semibold text-gray-900 mt-0.5 truncate">{value}</p>

        {/* Change indicator */}
        {change !== undefined && (
          <div
            className={cn(
              'flex items-center gap-1 mt-1.5 text-xs font-medium',
              isUp   && 'text-emerald-600',
              isDown && 'text-red-500',
              !isUp && !isDown && 'text-gray-400'
            )}
          >
            {isUp   && <TrendingUp  className="h-3.5 w-3.5" />}
            {isDown && <TrendingDown className="h-3.5 w-3.5" />}
            {!isUp && !isDown && <Minus className="h-3.5 w-3.5" />}
            <span>
              {change === 0
                ? 'No change'
                : `${isUp ? '+' : ''}${change.toFixed(1)}% vs yesterday`}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
