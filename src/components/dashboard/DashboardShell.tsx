'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { Header } from '@/components/dashboard/Header'
import { BottomNav } from '@/components/dashboard/BottomNav'
import { QuickActions } from '@/components/ui/QuickActions'
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

          <main className="flex-1 overflow-y-auto bg-[var(--bg-base)] pb-20 lg:pb-0">
            {children}
          </main>
        </div>

        <BottomNav modules={activeModules} />
        <QuickActions />
      </div>
    </StoreProvider>
  )
}
