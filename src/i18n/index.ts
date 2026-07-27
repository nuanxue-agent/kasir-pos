/**
 * i18n/index.ts
 *
 * Unified translation helper for both server and client components.
 *
 * Server components:  import { getT } from '@/i18n'
 *                     const t = await getT('products')
 *
 * Client components:  use the `useTranslations` hook from next-intl directly,
 *                     or import { useT } from '@/i18n' as a convenience re-export.
 */

// Server-side helper — wraps next-intl's getTranslations
export { getTranslations as getT } from 'next-intl/server'

// Client-side helper — re-export useTranslations under a shorter alias
export { useTranslations as useT } from 'next-intl'

// Re-export everything from routing for convenience
export { locales, defaultLocale, localeNames, localeFlags, localeDir } from './routing'
export type { Locale } from './routing'
