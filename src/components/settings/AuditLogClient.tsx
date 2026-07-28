'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  Download,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Activity,
  Loader2,
  User,
  Clock,
  Filter,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  entriesToCsv,
  labelForAction,
  ALL_AUDIT_ACTIONS,
  type AuditLogEntry,
  type HeatmapCell,
  type SuspiciousFlag,
} from '@/lib/audit-logic'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLogsResponse {
  entries: AuditLogEntry[]
  total: number
  page: number
  pages: number
  pageSize: number
}

interface SummaryResponse {
  period: number
  total: number
  heatmap: HeatmapCell[]
  suspiciousFlags: SuspiciousFlag[]
  actionBreakdown: Record<string, number>
}

interface AuditLogClientProps {
  storeId: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ActionBadge({ action }: { action: string }) {
  const isDelete = ['PRODUCT_DELETE', 'ORDER_VOID', 'ORDER_REFUND'].includes(action)
  const isCreate = action.endsWith('_CREATE') || action === 'LOGIN' || action === 'SHIFT_OPEN'
  const isUpdate = action.endsWith('_UPDATE') || action === 'STOCK_ADJUST' || action === 'SHIFT_CLOSE'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        isDelete && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        isCreate && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        isUpdate && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        !isDelete && !isCreate && !isUpdate && 'bg-[var(--bg-subtle)] text-[var(--text-2)]',
      )}
    >
      {labelForAction(action)}
    </span>
  )
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function HeatmapGrid({ cells, period }: { cells: HeatmapCell[]; period: number }) {
  if (cells.length === 0) {
    return (
      <p className="text-sm text-[var(--text-3)] py-4 text-center">
        Tidak ada aktivitas dalam {period} hari terakhir.
      </p>
    )
  }

  const maxCount = Math.max(...cells.map(c => c.count), 1)

  // Group by userId
  const byUser = new Map<string, { userName: string; cells: HeatmapCell[] }>()
  for (const cell of cells) {
    const existing = byUser.get(cell.userId)
    if (existing) {
      existing.cells.push(cell)
    } else {
      byUser.set(cell.userId, { userName: cell.userName, cells: [cell] })
    }
  }

  return (
    <div className="space-y-3">
      {Array.from(byUser.entries()).map(([userId, { userName, cells: userCells }]) => (
        <div key={userId} className="space-y-1">
          <p className="text-xs font-medium text-[var(--text-2)]">{userName}</p>
          <div className="flex flex-wrap gap-1">
            {userCells.map(cell => {
              const intensity = cell.count / maxCount
              const opacity = Math.max(0.1, intensity)
              return (
                <div
                  key={cell.date}
                  title={`${cell.date}: ${cell.count} aksi`}
                  className="h-6 w-6 rounded-sm border border-[var(--border)] cursor-default"
                  style={{ backgroundColor: `rgba(var(--accent-rgb, 99 102 241) / ${opacity})` }}
                />
              )
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-[var(--text-3)]">
        Setiap kotak = 1 hari. Warna lebih gelap = lebih banyak aksi.
      </p>
    </div>
  )
}

// ─── Suspicious flags panel ───────────────────────────────────────────────────

function SuspiciousPanel({ flags }: { flags: SuspiciousFlag[] }) {
  if (flags.length === 0) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
          <Shield className="h-4 w-4" />
          Tidak ada aktivitas mencurigakan yang terdeteksi.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {flags.map((flag, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 p-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              {flag.type === 'EXCESSIVE_DELETES'
                ? 'Penghapusan Berlebihan'
                : flag.type === 'BULK_ACTION'
                ? 'Aktivitas Massal'
                : 'Login dari IP Baru'}
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-400">{flag.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AuditLogClient({ storeId }: AuditLogClientProps) {
  // List state
  const [entries, setEntries]     = useState<AuditLogEntry[]>([])
  const [total, setTotal]         = useState(0)
  const [pages, setPages]         = useState(1)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)

  // Filters
  const [filterUser,         setFilterUser]         = useState('')
  const [filterAction,       setFilterAction]       = useState('')
  const [filterResourceType, setFilterResourceType] = useState('')
  const [filterFrom,         setFilterFrom]         = useState('')
  const [filterTo,           setFilterTo]           = useState('')
  const [search,             setSearch]             = useState('')

  // Summary tab
  const [activeTab,   setActiveTab]   = useState<'log' | 'summary'>('log')
  const [summary,     setSummary]     = useState<SummaryResponse | null>(null)
  const [sumPeriod,   setSumPeriod]   = useState(30)
  const [sumLoading,  setSumLoading]  = useState(false)

  // ── Fetch log ──────────────────────────────────────────────────────────────

  const fetchLog = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ storeId, page: String(p), pageSize: '20' })
      if (filterUser)         params.set('userId',       filterUser)
      if (filterAction)       params.set('action',       filterAction)
      if (filterResourceType) params.set('resourceType', filterResourceType)
      if (filterFrom)         params.set('from',         filterFrom)
      if (filterTo)           params.set('to',           filterTo)

      const res = await fetch(`/api/audit-logs?${params}`)
      if (!res.ok) { toast.error('Gagal memuat log'); return }
      const data = await res.json() as AuditLogsResponse
      setEntries(data.entries)
      setTotal(data.total)
      setPages(data.pages)
      setPage(data.page)
    } finally {
      setLoading(false)
    }
  }, [storeId, filterUser, filterAction, filterResourceType, filterFrom, filterTo])

  useEffect(() => { fetchLog(1) }, [fetchLog])

  // ── Fetch summary ──────────────────────────────────────────────────────────

  const fetchSummary = useCallback(async () => {
    setSumLoading(true)
    try {
      const res = await fetch(`/api/audit-logs/summary?storeId=${storeId}&period=${sumPeriod}`)
      if (!res.ok) { toast.error('Gagal memuat ringkasan'); return }
      setSummary(await res.json() as SummaryResponse)
    } finally {
      setSumLoading(false)
    }
  }, [storeId, sumPeriod])

  useEffect(() => {
    if (activeTab === 'summary') fetchSummary()
  }, [activeTab, fetchSummary])

  // ── Export CSV ─────────────────────────────────────────────────────────────

  const handleExportCsv = async () => {
    // Fetch up to 5 000 rows for export
    toast.success('Mengekspor data…')
    try {
      const params = new URLSearchParams({ storeId, page: '1', pageSize: '5000' })
      if (filterUser)         params.set('userId',       filterUser)
      if (filterAction)       params.set('action',       filterAction)
      if (filterResourceType) params.set('resourceType', filterResourceType)
      if (filterFrom)         params.set('from',         filterFrom)
      if (filterTo)           params.set('to',           filterTo)

      const res = await fetch(`/api/audit-logs?${params}`)
      if (!res.ok) { toast.error('Gagal mengekspor'); return }
      const data = await res.json() as AuditLogsResponse

      const csv = entriesToCsv(data.entries)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-${storeId}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`${data.entries.length} baris diekspor`)
    } catch {
      toast.error('Gagal mengekspor data')
    }
  }

  // ── Client-side search filter ──────────────────────────────────────────────

  const displayed = search
    ? entries.filter(e =>
        (e.userName ?? e.userId).toLowerCase().includes(search.toLowerCase()) ||
        e.action.toLowerCase().includes(search.toLowerCase()) ||
        (e.resourceId ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : entries

  const hasFilters = !!(filterUser || filterAction || filterResourceType || filterFrom || filterTo)

  const clearFilters = () => {
    setFilterUser('')
    setFilterAction('')
    setFilterResourceType('')
    setFilterFrom('')
    setFilterTo('')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1 w-fit">
        {(['log', 'summary'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab
                ? 'bg-[var(--bg)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-2)] hover:text-[var(--text-1)]',
            )}
          >
            {tab === 'log' ? 'Log Aktivitas' : 'Ringkasan & Kepatuhan'}
          </button>
        ))}
      </div>

      {/* ── LOG TAB ───────────────────────────────────────────────────────── */}
      {activeTab === 'log' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-3)]" />
              <input
                type="text"
                placeholder="Cari pengguna, aksi…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)] w-52"
              />
            </div>

            {/* Action filter */}
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              aria-label="Filter aksi"
            >
              <option value="">Semua Aksi</option>
              {ALL_AUDIT_ACTIONS.map(a => (
                <option key={a} value={a}>{labelForAction(a)}</option>
              ))}
            </select>

            {/* Resource type filter */}
            <input
              type="text"
              placeholder="Tipe Sumber Daya"
              value={filterResourceType}
              onChange={e => setFilterResourceType(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm w-40"
              aria-label="Filter tipe sumber daya"
            />

            {/* Date range */}
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              aria-label="Dari tanggal"
            />
            <span className="text-[var(--text-3)] text-sm">–</span>
            <input
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              aria-label="Sampai tanggal"
            />

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-2)] hover:bg-[var(--bg-subtle)]"
                aria-label="Hapus filter"
              >
                <X className="h-3 w-3" /> Hapus Filter
              </button>
            )}

            <button
              onClick={() => fetchLog(1)}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg-subtle)]"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>

            <button
              onClick={handleExportCsv}
              className="ml-auto flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Download className="h-4 w-4" />
              Ekspor CSV
            </button>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 text-sm text-[var(--text-2)]">
            <span className="flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" />
              {total.toLocaleString()} entri
            </span>
            {hasFilters && <span className="text-xs text-[var(--accent)]">Filter aktif</span>}
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-subtle)] text-xs uppercase tracking-wide text-[var(--text-2)]">
                  <tr>
                    <th className="px-4 py-3 text-left">Waktu</th>
                    <th className="px-4 py-3 text-left">Pengguna</th>
                    <th className="px-4 py-3 text-left">Aksi</th>
                    <th className="px-4 py-3 text-left">Sumber Daya</th>
                    <th className="px-4 py-3 text-left">ID Sumber Daya</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {displayed.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-[var(--text-3)]">
                        Tidak ada entri yang cocok
                      </td>
                    </tr>
                  ) : (
                    displayed.map(entry => (
                      <tr
                        key={entry.id}
                        className="bg-[var(--bg)] hover:bg-[var(--bg-subtle)] transition-colors"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-[var(--text-2)]">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            {fmtDate(entry.createdAt)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 font-medium text-[var(--text-1)]">
                            <User className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
                            {entry.userName ?? entry.userId}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ActionBadge action={entry.action} />
                        </td>
                        <td className="px-4 py-3 text-[var(--text-2)]">
                          {entry.resourceType ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-3)]">
                          {entry.resourceId ?? '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-[var(--text-2)]">
              <span>
                Halaman {page} dari {pages}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => fetchLog(page - 1)}
                  disabled={page <= 1}
                  className="rounded-lg border border-[var(--border)] p-1.5 hover:bg-[var(--bg-subtle)] disabled:opacity-40"
                  aria-label="Halaman sebelumnya"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => fetchLog(page + 1)}
                  disabled={page >= pages}
                  className="rounded-lg border border-[var(--border)] p-1.5 hover:bg-[var(--bg-subtle)] disabled:opacity-40"
                  aria-label="Halaman berikutnya"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SUMMARY TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* Period picker */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--text-2)]">Periode:</span>
            {[7, 30, 90].map(p => (
              <button
                key={p}
                onClick={() => setSumPeriod(p)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                  sumPeriod === p
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--border)] hover:bg-[var(--bg-subtle)]',
                )}
              >
                {p} hari
              </button>
            ))}
          </div>

          {sumLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
            </div>
          ) : summary ? (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs text-[var(--text-3)]">Total Aksi</p>
                  <p className="text-2xl font-bold text-[var(--text-1)]">
                    {summary.total.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs text-[var(--text-3)]">Tanda Mencurigakan</p>
                  <p className={cn(
                    'text-2xl font-bold',
                    summary.suspiciousFlags.length > 0 ? 'text-yellow-500' : 'text-green-500',
                  )}>
                    {summary.suspiciousFlags.length}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs text-[var(--text-3)]">Pengguna Aktif</p>
                  <p className="text-2xl font-bold text-[var(--text-1)]">
                    {new Set(summary.heatmap.map(c => c.userId)).size}
                  </p>
                </div>
              </div>

              {/* Suspicious activity */}
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  Aktivitas Mencurigakan
                </h3>
                <SuspiciousPanel flags={summary.suspiciousFlags} />
              </div>

              {/* Action breakdown */}
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
                  <Activity className="h-4 w-4 text-[var(--accent)]" />
                  Distribusi Aksi
                </h3>
                <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--bg-subtle)] text-xs uppercase tracking-wide text-[var(--text-2)]">
                      <tr>
                        <th className="px-4 py-2 text-left">Aksi</th>
                        <th className="px-4 py-2 text-right">Jumlah</th>
                        <th className="px-4 py-2 text-left">Proporsi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {Object.entries(summary.actionBreakdown)
                        .sort(([, a], [, b]) => b - a)
                        .map(([action, count]) => (
                          <tr key={action} className="bg-[var(--bg)] hover:bg-[var(--bg-subtle)]">
                            <td className="px-4 py-2">
                              <ActionBadge action={action} />
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-[var(--text-1)]">
                              {count.toLocaleString()}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-2 rounded-full bg-[var(--accent)]/60"
                                  style={{ width: `${Math.round((count / summary.total) * 100)}%`, minWidth: 4 }}
                                />
                                <span className="text-xs text-[var(--text-3)]">
                                  {Math.round((count / summary.total) * 100)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Heatmap */}
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-1)]">
                  <Activity className="h-4 w-4 text-[var(--accent)]" />
                  Peta Panas Aktivitas (per Pengguna per Hari)
                </h3>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                  <HeatmapGrid cells={summary.heatmap} period={summary.period} />
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
