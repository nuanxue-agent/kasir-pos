'use client'

import { useEffect, useState } from 'react'

const DISMISSED_KEY = 'lakoo-pwa-install-dismissed'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Only show on mobile-ish viewports
    const isMobile = () =>
      typeof window !== 'undefined' && window.innerWidth < 768

    // Already installed (standalone or display-override)
    const isInstalled = () =>
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        // iOS Safari sets navigator.standalone
        ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true))

    // Previously dismissed
    const isDismissed = () => {
      try {
        return localStorage.getItem(DISMISSED_KEY) === 'true'
      } catch {
        return false
      }
    }

    if (isInstalled() || isDismissed()) return

    const handler = (e: Event) => {
      e.preventDefault()
      const promptEvent = e as BeforeInstallPromptEvent
      setDeferredPrompt(promptEvent)
      if (isMobile()) {
        setVisible(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handler)

    // iOS doesn't fire beforeinstallprompt — show a manual tip on mobile Safari
    const isIOS =
      typeof navigator !== 'undefined' &&
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !('MSStream' in window)
    const isMobileSafari =
      isIOS && /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)

    if (isMobileSafari && isMobile() && !isInstalled() && !isDismissed()) {
      setVisible(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    setVisible(false)
    setDeferredPrompt(null)
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // localStorage unavailable
    }
  }

  if (!visible) return null

  const isIOSMode = !deferredPrompt

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Install Lakoo POS app"
      className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-[var(--bg-card)] border-t border-[var(--border)] shadow-lg safe-area-inset-bottom"
    >
      <div className="flex items-start gap-3 max-w-lg mx-auto">
        {/* App icon */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-96.png"
          alt="Lakoo POS icon"
          width={48}
          height={48}
          className="rounded-xl flex-shrink-0"
        />

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--text-1)] text-sm leading-tight">
            Install Lakoo POS
          </p>
          {isIOSMode ? (
            <p className="text-[var(--text-3)] text-xs mt-0.5">
              Tap <span className="font-medium">Share</span> then{' '}
              <span className="font-medium">Add to Home Screen</span> to install.
            </p>
          ) : (
            <p className="text-[var(--text-3)] text-xs mt-0.5">
              Install the app for a faster, offline-ready experience.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isIOSMode && (
            <button
              onClick={handleInstall}
              className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
            >
              Install App
            </button>
          )}
          <button
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
            className="text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors p-1 rounded-full"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
