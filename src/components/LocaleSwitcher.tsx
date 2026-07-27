'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { locales, localeNames, localeFlags, localeDir, defaultLocale, type Locale } from '@/i18n'

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function listener(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return
      handler()
    }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [ref, handler])
}

function getStoredLocale(): Locale {
  if (typeof document === 'undefined') return defaultLocale
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/)
  const val = match?.[1] as Locale | undefined
  return val && locales.includes(val) ? val : defaultLocale
}

function setStoredLocale(locale: Locale) {
  // Persist for 1 year, path=/ so all routes see it
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `NEXT_LOCALE=${locale}; max-age=${maxAge}; path=/; SameSite=Lax`
}

interface LocaleSwitcherProps {
  /** Additional CSS classes for the wrapper */
  className?: string
  /** Show full language name next to flag. Default true. */
  showName?: boolean
}

export function LocaleSwitcher({ className, showName = true }: LocaleSwitcherProps) {
  const [current, setCurrent] = useState<Locale>(getStoredLocale)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, () => setOpen(false))

  function handleSelect(locale: Locale) {
    if (locale === current) {
      setOpen(false)
      return
    }
    setStoredLocale(locale)
    setCurrent(locale)
    setOpen(false)
    // Reload so next-intl's request config picks up the new cookie
    window.location.reload()
  }

  const isRtl = localeDir[current] === 'rtl'

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch language"
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg',
          'bg-stone-50 border border-stone-200 text-sm text-stone-600',
          'hover:text-stone-800 hover:bg-stone-100 hover:border-stone-300',
          'transition-all select-none',
          isRtl && 'flex-row-reverse',
        )}
      >
        <span className="text-base leading-none" aria-hidden="true">
          {localeFlags[current]}
        </span>
        {showName && (
          <span className="text-xs font-medium max-w-[96px] truncate hidden sm:block">
            {localeNames[current]}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-3 w-3 text-stone-400 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Language options"
          className={cn(
            'absolute top-full mt-1.5 w-48 bg-white rounded-xl',
            'border border-stone-200 shadow-lg shadow-stone-100 py-1 z-50',
            // Align dropdown: flip to left side for RTL locales
            isRtl ? 'left-0' : 'right-0',
          )}
        >
          {locales.map(locale => {
            const isSelected = locale === current
            const dir = localeDir[locale]
            return (
              <button
                key={locale}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(locale)}
                dir={dir}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors',
                  'hover:bg-stone-50',
                  isSelected
                    ? 'text-amber-600 font-medium bg-amber-50/50'
                    : 'text-stone-600 hover:text-stone-800',
                  dir === 'rtl' && 'flex-row-reverse text-right',
                )}
              >
                <span className="text-base leading-none shrink-0" aria-hidden="true">
                  {localeFlags[locale]}
                </span>
                <span className="truncate">{localeNames[locale]}</span>
                {isSelected && (
                  <span className={cn('ml-auto text-amber-500 text-xs', dir === 'rtl' && 'ml-0 mr-auto')}>
                    ✓
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
