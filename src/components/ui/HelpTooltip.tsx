'use client'

import { useState, useRef, useEffect } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HelpTooltipProps {
  text: string
  /** Tooltip position relative to trigger icon. Defaults to 'top'. */
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

/**
 * A small (?) info icon that shows a tooltip with an explanation on hover/focus.
 * Fully keyboard-accessible: focusable via Tab, tooltip shown on focus/hover.
 */
export function HelpTooltip({ text, side = 'top', className }: HelpTooltipProps) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!visible) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setVisible(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible])

  const positionCls: Record<NonNullable<HelpTooltipProps['side']>, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const arrowCls: Record<NonNullable<HelpTooltipProps['side']>, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-stone-800 border-x-transparent border-b-transparent border-4',
    bottom:
      'bottom-full left-1/2 -translate-x-1/2 border-b-stone-800 border-x-transparent border-t-transparent border-4',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-stone-800 border-y-transparent border-r-transparent border-4',
    right:
      'right-full top-1/2 -translate-y-1/2 border-r-stone-800 border-y-transparent border-l-transparent border-4',
  }

  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <button
        ref={ref}
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        aria-label={`Bantuan: ${text}`}
        aria-describedby={visible ? 'help-tooltip-content' : undefined}
        className="flex h-4 w-4 items-center justify-center rounded-full text-stone-400 transition-colors hover:text-amber-500 focus:text-amber-500 focus:outline-none"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {visible && (
        <span
          role="tooltip"
          id="help-tooltip-content"
          className={cn(
            'absolute z-50 w-56 rounded-lg bg-stone-800 px-3 py-2 text-xs leading-relaxed text-white shadow-lg',
            positionCls[side],
          )}
        >
          {text}
          <span className={cn('absolute border', arrowCls[side])} aria-hidden />
        </span>
      )}
    </span>
  )
}
