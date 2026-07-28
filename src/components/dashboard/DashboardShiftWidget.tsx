'use client'

import { UserCheck, Clock, Plus } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ShiftData {
  userName?: string
  openedAt: string
  openingCash?: number
}

interface DashboardShiftWidgetProps {
  shiftLoading: boolean
  activeShift: ShiftData | null
  currency: string
  totalRevenue: number
}

export function DashboardShiftWidget({
  shiftLoading,
  activeShift,
  currency,
  totalRevenue,
}: DashboardShiftWidgetProps) {
  return (
    <div className="rounded-xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50 to-purple-50 p-4 dark:border-indigo-900/50 dark:from-indigo-950/40 dark:to-purple-950/30">
      {shiftLoading ? (
        <div className="h-10 animate-pulse rounded-xl bg-indigo-100 dark:bg-indigo-900/30" />
      ) : activeShift ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 shadow-sm shadow-indigo-200 dark:shadow-indigo-900/40">
              <UserCheck className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-widest text-indigo-700 uppercase dark:text-indigo-400">
                Shift Aktif
              </p>
              <p className="mt-0.5 text-sm font-bold text-[var(--text-1)]">
                {activeShift.userName ?? 'Kasir'}
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-6 text-center sm:flex">
            <div>
              <p className="text-[10px] tracking-widest text-[var(--text-3)] uppercase">Dibuka</p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-1)]">
                {new Date(activeShift.openedAt).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <div>
              <p className="text-[10px] tracking-widest text-[var(--text-3)] uppercase">Kas Awal</p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-1)]">
                {formatCurrency(activeShift.openingCash ?? 0, currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] tracking-widest text-[var(--text-3)] uppercase">
                Omzet Shift
              </p>
              <p className="mt-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                {formatCurrency(totalRevenue, currency)}
              </p>
            </div>
          </div>
          <a
            href="/dashboard/shifts"
            className="shrink-0 rounded-lg bg-indigo-100 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-200 hover:text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-400 dark:hover:bg-indigo-900/60"
          >
            Detail
          </a>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-subtle)]">
              <Clock className="h-4 w-4 text-[var(--text-3)]" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-widest text-[var(--text-2)] uppercase">
                Tidak ada shift aktif
              </p>
              <p className="mt-0.5 text-sm text-[var(--text-3)]">
                Buka shift untuk mulai mencatat penjualan
              </p>
            </div>
          </div>
          <a
            href="/dashboard/shifts"
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Buka Shift
          </a>
        </div>
      )}
    </div>
  )
}
