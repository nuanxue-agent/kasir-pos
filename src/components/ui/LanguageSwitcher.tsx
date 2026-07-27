'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { Globe, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { locales, localeNames, localeFlags, type Locale } from '@/i18n/routing'

interface LanguageSwitcherProps {
  /** Current active locale — caller reads from cookie/context */
  currentLocale?: Locale
  /** Compact icon-only trigger (default: false) */
  compact?: boolean
  /** Extra classes on the root element */
  className?: string
}

const COOKIE_NAME = 'NEXT_LOCALE'
const STORAGE_KEY = 'preferred_locale'

function saveLocale(locale: Locale) {
  // 1. localStorage (client-side preference)
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // private-browsing / storage blocked — ignore
  }
}

async function setServerLocale(locale: Locale) {
  try {
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    })
  } catch {
    // best-effort; cookie fallback below
  }
}

function getStoredLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as Locale | null
    return v && (locales as readonly string[]).includes(v) ? v : null
  } catch {
    return null
  }
}

export function LanguageSwitcher({
  currentLocale,
  compact = false,
  className,
}: LanguageSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<Locale>(currentLocale ?? 'id')
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  // Sync with localStorage on mount if no explicit currentLocale given
  useEffect(() => {
    if (!currentLocale) {
      const stored = getStoredLocale()
      if (stored) setActive(stored)
    }
  }, [currentLocale])

  // Close on outside click / Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKey)
    }
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const handleSelect = (locale: Locale) => {
    setOpen(false)
    if (locale === active) return
    setActive(locale)
    saveLocale(locale)
    startTransition(async () => {
      await setServerLocale(locale)
      // Reload so server components re-render with new locale
      window.location.reload()
    })
  }

  const activeFlag = localeFlags[active]
  const activeName = localeNames[active]

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language switcher — current: ${activeName}`}
        disabled={isPending}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--bg-subtle)] focus:ring-2 focus:ring-amber-400/40 focus:outline-none disabled:cursor-wait disabled:opacity-50',
          compact ? 'px-2 py-1.5' : 'px-3 py-1.5',
        )}
      >
        {isPending ? (
          <Globe className="h-4 w-4 animate-pulse" aria-hidden="true" />
        ) : (
          <span aria-hidden="true" className="text-base leading-none">
            {activeFlag}
          </span>
        )}
        {!compact && <span className="hidden sm:inline">{activeName}</span>}
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Select language"
          className="absolute right-0 z-50 mt-1.5 min-w-[160px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-lg"
        >
          {locales.map(locale => (
            <li key={locale} role="option" aria-selected={locale === active}>
              <button
                type="button"
                onClick={() => handleSelect(locale)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-subtle)]',
                  locale === active ? 'font-semibold text-amber-600' : 'text-[var(--text-2)]',
                )}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {localeFlags[locale]}
                </span>
                <span className="flex-1 text-left">{localeNames[locale]}</span>
                {locale === active && (
                  <Check className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default LanguageSwitcher
