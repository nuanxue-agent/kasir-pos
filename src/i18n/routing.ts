import { defineRouting } from 'next-intl/routing'

export const locales = ['en', 'id', 'zh', 'ar'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'id'

export const localeNames: Record<Locale, string> = {
  en: 'English',
  id: 'Bahasa Indonesia',
  zh: '中文',
  ar: 'العربية',
}

export const localeFlags: Record<Locale, string> = {
  en: '🇬🇧',
  id: '🇮🇩',
  zh: '🇨🇳',
  ar: '🇸🇦',
}

export const localeDir: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  id: 'ltr',
  zh: 'ltr',
  ar: 'rtl',
}

// Routing config — used if you ever enable URL-based locale routing.
// Currently the app uses cookie-based locale switching (non-routing mode),
// so this is exported for reference but next.config.ts / middleware are NOT modified.
export const routing = defineRouting({
  locales,
  defaultLocale,
})
