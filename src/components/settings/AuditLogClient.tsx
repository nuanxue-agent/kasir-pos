'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Shield, ChevronLeft, ChevronRight, Filter } from 'lucide-react'

interface AuditEntry {
  id: string
  storeId: string
  userId: string
  userName?: string
  action: string
  resourceType: string | null
  resourceId: string | null
  meta: Record<string, unknown> | null
  createdAt: string
}

interface AuditResponse {
  entries: AuditEntry[]
  total: number
  pages: number
}

interface AuditLogClientProps {
  storeId: string
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  ORDER_CREATE: 'Buat Pesanan',
  ORDER_REFUND: 'Refund Pesanan',
  ORDER_VOID: 'Batal Pesanan',
  STOCK_ADJUST: 'Stok Disesuaikan',
  PRODUCT_CREATE: 'Buat Produk',
  PRODUCT_UPDATE: 'Update Produk',
  PRODUCT_DELETE: 'Hapus Produk',
  CUSTOMER_CREATE: 'Buat Pelanggan',
  CUSTOMER_UPDATE: 'Update Pelanggan',
  USER_CREATE: 'Buat User',
  USER_UPDATE: 'Update User',
  STORE_UPDATE: 'Update Toko',
  SHIFT_OPEN: 'Buka Shift',
  SHIFT_CLOSE: 'Tutup Shift',
}

const ACTION_PILL: Record<string, string> = {
  LOGIN: 'bg-blue-50 text-blue-600 border-blue-100',
  LOGOUT: 'bg-slate-50 text-slate-500 border-slate-100',
  ORDER_CREATE: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  ORDER_REFUND: 'bg-red-50 text-red-500 border-red-100',
  ORDER_VOID: 'bg-red-50 text-red-500 border-red-100',
  STOCK_ADJUST: 'bg-amber-50 text-amber-600 border-amber-100',
  PRODUCT_CREATE: 'bg-violet-50 text-violet-600 border-violet-100',
  PRODUCT_UPDATE: 'bg-violet-50 text-violet-500 border-violet-100',
  PRODUCT_DELETE: 'bg-red-50 text-red-500 border-red-100',
}

const ALL_ACTIONS = Object.keys(ACTION_LABELS)

export default function AuditLogClient({ storeId }: AuditLogClientProps) {
  const [page, setPage] = useState(1)
  const [filterAction, setFilterAction] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', storeId, page, filterAction],
    queryFn: (): Promise<AuditResponse> => {
      const params = new URLSearchParams({ storeId, page: String(page) })
      if (filterAction) params.set('action', filterAction)
      return fetch(`/api/audit?${params}`).then(r => r.json())
    },
    placeholderData: prev => prev,
  })

  const entries: AuditEntry[] = data?.entries ?? []
  const total: number = data?.total ?? 0
  const pages: number = data?.pages ?? 1

  function pillClass(action: string) {
    return (
      (ACTION_PILL[action] ?? 'bg-stone-50 text-stone-500 border-stone-100') +
      ' border text-[10px] font-semibold px-2 py-0.5 rounded-full'
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-[var(--text-1)]">Log Aktivitas</h2>
          {total > 0 && (
            <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">
              {total}
            </span>
          )}
        </div>

        {/* Action filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-[var(--text-3)]" />
          <select
            value={filterAction}
            onChange={e => {
              setFilterAction(e.target.value)
              setPage(1)
            }}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-2)] focus:ring-2 focus:ring-amber-300 focus:outline-none"
          >
            <option value="">Semua aksi</option>
            {ALL_ACTIONS.map(a => (
              <option key={a} value={a}>
                {ACTION_LABELS[a] ?? a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-sm">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <Shield className="h-8 w-8 text-stone-200" />
            <p className="text-sm text-[var(--text-3)]">Belum ada aktivitas tercatat</p>
          </div>
        ) : (
          <>
            {/* Desktop table header */}
            <div className="hidden grid-cols-[1fr_1fr_1.5fr_1fr_auto] gap-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2.5 sm:grid">
              {['Waktu', 'Pengguna', 'Aksi', 'Resource', ''].map(h => (
                <span
                  key={h}
                  className="text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase"
                >
                  {h}
                </span>
              ))}
            </div>

            <div className="divide-y divide-[var(--border)]">
              {entries.map(entry => (
                <div
                  key={entry.id}
                  className="grid grid-cols-1 items-center gap-1 px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)] sm:grid-cols-[1fr_1fr_1.5fr_1fr_auto] sm:gap-3"
                >
                  <div>
                    <p className="text-xs font-medium text-[var(--text-2)]">
                      {new Date(entry.createdAt).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                    <p className="text-[10px] text-[var(--text-3)]">
                      {new Date(entry.createdAt).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </p>
                  </div>

                  <p className="truncate text-xs text-[var(--text-2)]">
                    {entry.userName ?? entry.userId}
                  </p>

                  <span className={pillClass(entry.action)}>
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </span>

                  <div className="min-w-0">
                    {entry.resourceType && (
                      <p className="truncate text-xs text-[var(--text-3)]">
                        {entry.resourceType}
                        {entry.resourceId && (
                          <span className="text-[var(--text-3)] opacity-60">
                            {' '}
                            #{entry.resourceId.slice(-6)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Meta popover hint */}
                  <div className="hidden w-4 sm:block" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-[var(--text-3)]">
            Halaman {page} dari {pages} · {total} entri
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-2)] transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-40"
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            {Array.from({ length: Math.min(5, pages) }, (_, i) => {
              const p = Math.max(1, Math.min(pages - 4, page - 2)) + i
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`h-7 min-w-[28px] rounded-lg border text-xs font-medium transition-colors ${
                    p === page
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {p}
                </button>
              )
            })}
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-2)] transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-40"
              aria-label="Halaman berikutnya"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
