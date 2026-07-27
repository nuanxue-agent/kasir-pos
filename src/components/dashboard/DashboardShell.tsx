'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { Header } from '@/components/dashboard/Header'
import { BottomNav } from '@/components/dashboard/BottomNav'
import type { UserRole } from '@/lib/permissions'

interface DashboardShellProps {
  children: React.ReactNode
  userName: string
  userEmail?: string | null
  userImage?: string | null
  userRole: UserRole
  isSuperAdmin: boolean
  stores: Array<{ id: string; name: string }>
}

export function DashboardShell({
  children,
  userName,
  userEmail,
  userImage,
  userRole,
  isSuperAdmin,
  stores,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentStoreId, setCurrentStoreId] = useState(stores[0]?.id)

  return (
    <div className="flex h-screen overflow-hidden bg-[#fffdf7]">
      <Sidebar
        userRole={userRole}
        isSuperAdmin={isSuperAdmin}
        userName={userName}
        userEmail={userEmail}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          userName={userName}
          userEmail={userEmail}
          userImage={userImage}
          userRole={userRole}
          stores={stores}
          currentStoreId={currentStoreId}
          onStoreChange={setCurrentStoreId}
          onMenuToggle={() => setSidebarOpen((v) => !v)}
        />

        {/* Main scroll area — add pb-20 on mobile so content clears bottom nav */}
        <main className="flex-1 overflow-y-auto bg-[#fffdf7] pb-20 lg:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  )
}
