import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { cookies } from 'next/headers'
import { locales, defaultLocale, type Locale } from '@/i18n/routing'
import WebVitalsTracker from '@/components/analytics/WebVitalsTracker'

const inter = Inter({ subsets: ['latin', 'latin-ext'] })

export const metadata: Metadata = {
  title: 'Lakoo — Business Made Simple',
  description: 'Point of Sale & Business Management for SMEs. Track sales, manage inventory, payroll, accounting, and CRM in one place.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Lakoo POS',
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    siteName: 'Lakoo POS',
    title: 'Lakoo — Business Made Simple',
    description: 'POS & Business Management for SMEs',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#f59e0b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value as Locale | undefined
  const locale: Locale =
    cookieLocale && locales.includes(cookieLocale) ? cookieLocale : defaultLocale

  // Load messages directly — avoids dependency on next-intl/config alias in static workers
  const messages = (await import(`../../messages/${locale}.json`)).default

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Inline script: apply theme before first paint to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  try {
    var ACCENT_MAP = {
      amber:  { primary: '#f59e0b', accent: '#ea580c' },
      blue:   { primary: '#3b82f6', accent: '#2563eb' },
      green:  { primary: '#22c55e', accent: '#16a34a' },
      purple: { primary: '#8b5cf6', accent: '#7c3aed' },
      red:    { primary: '#ef4444', accent: '#dc2626' },
    };
    var theme = localStorage.getItem('theme') || 'auto';
    var isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');
    var accent = localStorage.getItem('accent-color') || 'amber';
    var colors = ACCENT_MAP[accent] || ACCENT_MAP.amber;
    document.documentElement.style.setProperty('--primary', colors.primary);
    document.documentElement.style.setProperty('--accent', colors.accent);
  } catch(e) {}
})();`,
          }}
        />
      </head>
      <body className={inter.className}>
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
        <WebVitalsTracker />
      </body>
    </html>
  )
}
