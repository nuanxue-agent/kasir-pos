'use client'

import { useState } from 'react'
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
