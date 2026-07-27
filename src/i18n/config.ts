export const locales = ['en', 'id', 'zh', 'ar'] as const
export type Locale = typeof locales[number]
export const defaultLocale: Locale = 'en'
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
export const rtlLocales: Locale[] = ['ar']
export function isRTL(locale: Locale): boolean {
  return rtlLocales.includes(locale)
}
