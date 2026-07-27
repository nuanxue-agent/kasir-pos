'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'

type ThemeMode = 'light' | 'dark' | 'auto'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode) {
  const html = document.documentElement
  if (mode === 'auto') {
    const sys = getSystemTheme()
    html.classList.toggle('dark', sys === 'dark')
  } else {
    html.classList.toggle('dark', mode === 'dark')
  }
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('auto')

  // Initialise from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('theme') as ThemeMode | null
    const initial: ThemeMode = stored === 'light' || stored === 'dark' || stored === 'auto'
      ? stored
      : 'auto'
    setMode(initial)
    applyTheme(initial)

    // Watch system preference changes when in auto mode
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => {
      const cur = (localStorage.getItem('theme') as ThemeMode | null) ?? 'auto'
      if (cur === 'auto') applyTheme('auto')
    }
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [])

  function cycle() {
    const next: ThemeMode = mode === 'light' ? 'dark' : mode === 'dark' ? 'auto' : 'light'
    setMode(next)
    localStorage.setItem('theme', next)
    applyTheme(next)
  }

  const label =
    mode === 'light' ? 'Tema terang' : mode === 'dark' ? 'Tema gelap' : 'Ikuti sistem'

  return (
    <button
      onClick={cycle}
      aria-label={label}
      title={label}
      className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-3)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]"
    >
      {mode === 'light' && <Sun className="h-4 w-4" />}
      {mode === 'dark' && <Moon className="h-4 w-4" />}
      {mode === 'auto' && <Monitor className="h-4 w-4" />}
    </button>
  )
}
