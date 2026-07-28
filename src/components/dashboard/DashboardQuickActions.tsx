'use client'

import Link from 'next/link'
import { ShoppingBag, Package, ShoppingCart, Users, Boxes, BarChart3 } from 'lucide-react'

export function DashboardQuickActions() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-3">
      <Link
        href="/dashboard/pos"
        className="flex flex-col items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3 text-center text-xs font-medium text-indigo-700 transition-all hover:bg-indigo-100 active:scale-95 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
      >
        <ShoppingBag className="h-4 w-4 shrink-0" />
        <span>Kasir</span>
      </Link>
      <Link
        href="/dashboard/products"
        className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 text-center text-xs font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-muted)] active:scale-95 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
      >
        <Package className="h-4 w-4 shrink-0" />
        <span>Produk</span>
      </Link>
      <Link
        href="/dashboard/orders"
        className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 text-center text-xs font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-muted)] active:scale-95 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
      >
        <ShoppingCart className="h-4 w-4 shrink-0" />
        <span>Pesanan</span>
      </Link>
      <Link
        href="/dashboard/customers"
        className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 text-center text-xs font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-muted)] active:scale-95 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
      >
        <Users className="h-4 w-4 shrink-0" />
        <span>Pelanggan</span>
      </Link>
      <Link
        href="/dashboard/inventory"
        className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 text-center text-xs font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-muted)] active:scale-95 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
      >
        <Boxes className="h-4 w-4 shrink-0" />
        <span>Stok</span>
      </Link>
      <Link
        href="/dashboard/reports"
        className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 text-center text-xs font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-muted)] active:scale-95 sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
      >
        <BarChart3 className="h-4 w-4 shrink-0" />
        <span>Laporan</span>
      </Link>
    </div>
  )
}
