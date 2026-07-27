/**
 * src/i18n/index.ts
 *
 * Referenced by next.config.ts → createNextIntlPlugin('./src/i18n/index.ts').
 * Must default-export getRequestConfig for next-intl's internal alias resolution.
 *
 * For server components that need translations, use next-intl/server directly:
 *   import { getTranslations } from 'next-intl/server'
 *   const t = await getTranslations('products')
 *
 * For client components:
 *   import { useTranslations } from 'next-intl'
 *   const t = useTranslations('products')
 */
import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { defaultLocale, locales, type Locale } from './routing'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const raw = cookieStore.get('NEXT_LOCALE')?.value as Locale | undefined
  const locale: Locale = raw && locales.includes(raw) ? raw : defaultLocale

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})

// Locale metadata — safe to import anywhere (no next-intl/config dependency)
export { locales, defaultLocale, localeNames, localeFlags, localeDir } from './routing'
export type { Locale } from './routing'
