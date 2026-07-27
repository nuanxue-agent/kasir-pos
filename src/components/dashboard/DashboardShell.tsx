'use client'

import { useState, useEffect, useRef } from 'react'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { Header } from '@/components/dashboard/Header'
import { BottomNav } from '@/components/dashboard/BottomNav'
import { QuickActions } from '@/components/ui/QuickActions'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { StoreProvider } from '@/context/StoreContext'
import type { UserRole } from '@/lib/permissions'

export interface StoreShell {
  id: string
  name: string
  address?: string
  phone?: string
  currency: string
  timezone: string
  taxRate: number
  receiptNote?: string
  modules: string[]
}

interface DashboardShellProps {
  children: React.ReactNode
  userName: string
  userEmail?: string | null
  userImage?: string | null
  userRole: UserRole
  isSuperAdmin: boolean
  stores: StoreShell[]
  modules?: string[]
  initialStoreId?: string
}

// Swipe threshold in pixels — must drag at least this far to trigger
const SWIPE_THRESHOLD = 60
// Only respond to touch that starts within this px from the left edge (open gesture)
const EDGE_ZONE = 40

export function DashboardShell({
  children,
  userName,
  userEmail,
  userImage,
  userRole,
  isSuperAdmin,
  stores,
  modules,
  initialStoreId,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentStoreId, setCurrentStoreId] = useState(initialStoreId ?? stores[0]?.id)

  // Derive modules from the current store if not explicitly provided
  const currentStore = stores.find(s => s.id === currentStoreId) ?? stores[0]
  const activeModules = modules ??
    currentStore?.modules ?? ['pos', 'inventory', 'customers', 'discounts', 'reports']

  // ── Swipe gesture to open/close sidebar on mobile ─────────────────────────
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      touchStartX.current = t.clientX
      touchStartY.current = t.clientY
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return
      const t = e.changedTouches[0]
      const deltaX = t.clientX - touchStartX.current
      const deltaY = t.clientY - (touchStartY.current ?? 0)

      // Only handle mostly-horizontal swipes (avoid conflicting with scroll)
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        touchStartX.current = null
        touchStartY.current = null
        return
      }

      // Swipe RIGHT from left edge → open sidebar
      if (deltaX > SWIPE_THRESHOLD && touchStartX.current <= EDGE_ZONE && !sidebarOpen) {
        setSidebarOpen(true)
      }
      // Swipe LEFT anywhere → close sidebar
      else if (deltaX < -SWIPE_THRESHOLD && sidebarOpen) {
        setSidebarOpen(false)
      }

      touchStartX.current = null
      touchStartY.current = null
    }

    // Only register on non-desktop viewports
    const mq = window.matchMedia('(max-width: 1023px)')
    if (mq.matches) {
      document.addEventListener('touchstart', onTouchStart, { passive: true })
      document.addEventListener('touchend', onTouchEnd, { passive: true })
    }

    const handleResize = () => {
      if (mq.matches) {
        document.addEventListener('touchstart', onTouchStart, { passive: true })
        document.addEventListener('touchend', onTouchEnd, { passive: true })
      } else {
        document.removeEventListener('touchstart', onTouchStart)
        document.removeEventListener('touchend', onTouchEnd)
        // Auto-close mobile sidebar when resizing to desktop
        setSidebarOpen(false)
      }
    }

    mq.addEventListener('change', handleResize)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
      mq.removeEventListener('change', handleResize)
    }
  }, [sidebarOpen])

  return (
    <StoreProvider stores={stores} initialStoreId={currentStoreId}>
      {/* Skip to main content — accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded-lg focus:bg-amber-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none"
      >
        Skip to content
      </a>

      <div className="flex h-screen overflow-hidden bg-[var(--bg-base)]">
        {/* Sidebar — hidden on mobile (< md), slides in via overlay when sidebarOpen */}
        <Sidebar
          userRole={userRole}
          isSuperAdmin={isSuperAdmin}
          userName={userName}
          userEmail={userEmail}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          modules={activeModules}
          stores={stores}
          currentStoreId={currentStoreId}
          onStoreChange={id => {
            setCurrentStoreId(id)
          }}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header
            userName={userName}
            userEmail={userEmail}
            userImage={userImage}
            userRole={userRole}
            stores={stores as any}
            currentStoreId={currentStoreId}
            onStoreChange={setCurrentStoreId}
            onMenuToggle={() => setSidebarOpen(v => !v)}
          />

          <main
            id="main-content"
            className="flex-1 overflow-y-auto bg-[var(--bg-base)] pb-20 lg:pb-0"
          >
            {children}
          </main>
        </div>

        {/* Bottom nav — mobile only, safe-area aware */}
        <BottomNav modules={activeModules} />
        <QuickActions />
      </div>

      {/* Footer with language switcher */}
      <footer className="hidden items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--bg-card)] px-6 py-2 lg:flex">
        <span className="text-xs text-[var(--text-3)]">Language</span>
        <LanguageSwitcher compact />
      </footer>
    </StoreProvider>
  )
}
