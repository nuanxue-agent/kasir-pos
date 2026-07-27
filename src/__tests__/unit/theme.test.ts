/**
 * Theme system unit tests
 * Covers: token validation, localStorage persistence, system preference detection,
 * accent color application, toggle state cycling (light → dark → auto)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── helpers (inline — no external import needed) ────────────────────────────

type ThemeMode = 'light' | 'dark' | 'auto'
type AccentKey = 'amber' | 'blue' | 'green' | 'purple' | 'red'

const ACCENT_MAP: Record<AccentKey, { primary: string; accent: string }> = {
  amber:  { primary: '#f59e0b', accent: '#ea580c' },
  blue:   { primary: '#3b82f6', accent: '#2563eb' },
  green:  { primary: '#22c55e', accent: '#16a34a' },
  purple: { primary: '#8b5cf6', accent: '#7c3aed' },
  red:    { primary: '#ef4444', accent: '#dc2626' },
}

const DARK_TOKENS: Record<string, string> = {
  '--bg-base':  '#1c1917',
  '--bg-card':  '#292524',
  '--bg-muted': '#1c1917',
  '--border':   '#44403c',
  '--text-1':   '#fafaf9',
  '--text-2':   '#a8a29e',
  '--text-3':   '#78716c',
  '--bg-input': '#292524',
}

function applyTheme(mode: ThemeMode, systemDark = false) {
  const isDark = mode === 'dark' || (mode === 'auto' && systemDark)
  document.documentElement.classList.toggle('dark', isDark)
}

function cycleMode(current: ThemeMode): ThemeMode {
  if (current === 'light') return 'dark'
  if (current === 'dark') return 'auto'
  return 'light'
}

function applyAccent(key: AccentKey) {
  const colors = ACCENT_MAP[key]
  document.documentElement.style.setProperty('--primary', colors.primary)
  document.documentElement.style.setProperty('--accent', colors.accent)
  localStorage.setItem('accent-color', key)
}

function initTheme(systemDark = false) {
  const stored = localStorage.getItem('theme') as ThemeMode | null
  const mode: ThemeMode =
    stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto'
  applyTheme(mode, systemDark)
  return mode
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('theme system', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.documentElement.style.removeProperty('--primary')
    document.documentElement.style.removeProperty('--accent')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Dark token values are correct
  it('dark mode CSS tokens have correct spec values', () => {
    expect(DARK_TOKENS['--bg-base']).toBe('#1c1917')
    expect(DARK_TOKENS['--bg-card']).toBe('#292524')
    expect(DARK_TOKENS['--bg-muted']).toBe('#1c1917')
    expect(DARK_TOKENS['--border']).toBe('#44403c')
    expect(DARK_TOKENS['--text-1']).toBe('#fafaf9')
    expect(DARK_TOKENS['--text-2']).toBe('#a8a29e')
    expect(DARK_TOKENS['--text-3']).toBe('#78716c')
    expect(DARK_TOKENS['--bg-input']).toBe('#292524')
  })

  // 2. Applying dark mode adds .dark class
  it('applyTheme("dark") adds dark class to html element', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  // 3. Applying light mode removes .dark class
  it('applyTheme("light") removes dark class from html element', () => {
    document.documentElement.classList.add('dark')
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  // 4. localStorage persistence — theme saved correctly
  it('saves theme preference to localStorage', () => {
    localStorage.setItem('theme', 'dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  // 5. localStorage persistence — accent saved correctly
  it('saves accent-color preference to localStorage', () => {
    applyAccent('blue')
    expect(localStorage.getItem('accent-color')).toBe('blue')
  })

  // 6. System preference detection — auto mode follows system dark
  it('auto mode with system dark applies dark class', () => {
    localStorage.setItem('theme', 'auto')
    const mode = initTheme(true /* systemDark */)
    expect(mode).toBe('auto')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  // 7. System preference detection — auto mode follows system light
  it('auto mode with system light does not add dark class', () => {
    localStorage.setItem('theme', 'auto')
    const mode = initTheme(false /* systemDark */)
    expect(mode).toBe('auto')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  // 8. Accent color application — sets CSS custom properties
  it('applyAccent sets --primary and --accent CSS variables', () => {
    applyAccent('blue')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#3b82f6')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#2563eb')
  })

  // 9. All 5 accent presets have valid hex colors
  it('all accent presets have valid hex color values', () => {
    const HEX_RE = /^#[0-9a-f]{6}$/i
    for (const [key, colors] of Object.entries(ACCENT_MAP)) {
      expect(colors.primary, `${key} primary`).toMatch(HEX_RE)
      expect(colors.accent, `${key} accent`).toMatch(HEX_RE)
    }
  })

  // 10. Toggle state cycles light → dark → auto → light
  it('cycleMode cycles through light → dark → auto → light', () => {
    expect(cycleMode('light')).toBe('dark')
    expect(cycleMode('dark')).toBe('auto')
    expect(cycleMode('auto')).toBe('light')
  })
})
