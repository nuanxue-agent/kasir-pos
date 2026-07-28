'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
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
  Eye,
  Lock,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SecurityEventType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'FAILED_LOGIN'
  | 'PERMISSION_DENIED'
  | 'VOID_TRANSACTION'
  | 'DISCOUNT_OVERRIDE'
  | 'PRICE_OVERRIDE'

export type SecurityEventSeverity = 'LOW' | 'MEDIUM' | 'HIGH'

export interface AuditLogEntry {
  id: string
  storeId: string
  userId: string
  action: string
  entityType: string | null
  entityId: string | null
  oldValue: Record<string, unknown> | null
  newValue: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

export interface SecurityEvent {
  id: string
  storeId: string
  userId: string | null
  type: SecurityEventType
  severity: SecurityEventSeverity
  description: string | null
  createdAt: string
}

export interface SecuritySummary {
  period: string
  days: number
  since: string
  total: number
  highSeverityCount: number
  byType: { type: string; count: number }[]
  bySeverity: { severity: string; count: number }[]
  byDay: { date: string; count: number }[]
  byUser: { userId: string; count: number }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const AUDIT_ACTIONS = [
  'LOGIN', 'LOGOUT', 'ORDER_CREATE', 'ORDER_REFUND', 'ORDER_VOID',
  'STOCK_ADJUST', 'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_DELETE',
  'CUSTOMER_CREATE', 'CUSTOMER_UPDATE', 'USER_CREATE', 'USER_UPDATE',
  'STORE_UPDATE', 'SHIFT_OPEN', 'SHIFT_CLOSE', 'DISCOUNT_OVERRIDE',
  'PRICE_OVERRIDE', 'VOID_TRANSACTION', 'PERMISSION_DENIED',
] as const

export const SECURITY_EVENT_TYPES: SecurityEventType[] = [
  'LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'PERMISSION_DENIED',
  'VOID_TRANSACTION', 'DISCOUNT_OVERRIDE', 'PRICE_OVERRIDE',
]

export const ENTITY_TYPES = [
  'ORDER', 'PRODUCT', 'CUSTOMER', 'USER', 'STORE', 'SHIFT', 'STOCK',
]

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function categorizeAction(action: string): 'auth' | 'pos' | 'admin' | 'inventory' | 'other' {
  if (['LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'PERMISSION_DENIED'].includes(action)) return 'auth'
  if (['ORDER_CREATE', 'ORDER_REFUND', 'ORDER_VOID', 'VOID_TRANSACTION',
       'DISCOUNT_OVERRIDE', 'PRICE_OVERRIDE', 'SHIFT_OPEN', 'SHIFT_CLOSE'].includes(action)) return 'pos'
  if (['USER_CREATE', 'USER_UPDATE', 'STORE_UPDATE'].includes(action)) return 'admin'
  if (['STOCK_ADJUST', 'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_DELETE'].includes(action)) return 'inventory'
  return 'other'
}

export function classifyEventSeverity(type: SecurityEventType): SecurityEventSeverity {
  if (['FAILED_LOGIN', 'PERMISSION_DENIED', 'VOID_TRANSACTION'].includes(type)) return 'HIGH'
  if (['DISCOUNT_OVERRIDE', 'PRICE_OVERRIDE'].includes(type)) return 'MEDIUM'
  return 'LOW'
}

export function filterEntriesByDate(entries: AuditLogEntry[], from?: string, to?: string): AuditLogEntry[] {
  return entries.filter(e => {
    if (from && e.createdAt < from) return false
    if (to && e.createdAt > to + 'T23:59:59.999Z') return false
    return true
  })
}

export function countEventsByType(events: SecurityEvent[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const ev of events) {
    counts[ev.type] = (counts[ev.type] ?? 0) + 1
  }
  return counts
}

export function verifyAuditIntegrity(entries: AuditLogEntry[]): { valid: boolean; issues: string[] } {
  const issues: string[] = []
  const ids = new Set<string>()
  for (const e of entries) {
    if (!e.id) issues.push(`Entry missing id`)
    if (ids.has(e.id)) issues.push(`Duplicate id: ${e.id}`)
    ids.add(e.id)
    if (!e.storeId) issues.push(`Entry ${e.id}: missing storeId`)
    if (!e.userId) issues.push(`Entry ${e.id}: missing userId`)
    if (!e.action) issues.push(`Entry ${e.id}: missing action`)
    if (!e.createdAt) issues.push(`Entry ${e.id}: missing createdAt`)
  }
  return { valid: issues.length === 0, issues }
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: SecurityEventSeverity }) {
  const cfg = {
    HIGH: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    MEDIUM: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    LOW: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  }
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium', cfg[severity])}>
      {severity}
    </span>
  )
}

function ActionBadge({ action }: { action: string }) {
  const cat = categorizeAction(action)
  const cfg: Record<string, string> = {
    auth: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    pos: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    inventory: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    other: 'bg-[var(--surface-2)] text-[var(--text-3)]',
  }
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium', cfg[cat])}>
      {action.replace(/_/g, ' ')}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-[var(--text-3)]">
      <Activity className="mb-2 h-8 w-8 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, highlight }: {
  label: string; value: number | string; icon: React.ElementType; highlight?: boolean
}) {
  return (
    <div className={cn(
      'rounded-lg border p-4',
      highlight
        ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10'
        : 'border-[var(--border)] bg-[var(--surface-1)]',
    )}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('h-4 w-4', highlight ? 'text-red-500' : 'text-[var(--text-3)]')} />
        <span className="text-xs text-[var(--text-3)]">{label}</span>
      </div>
      <p className={cn('text-2xl font-bold', highlight ? 'text-red-600 dark:text-red-400' : 'text-[var(--text-1)]')}>
        {value}
      </p>
    </div>
  )
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

function AuditLogTab({ storeId }: { storeId: string }) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [detail, setDetail] = useState<AuditLogEntry | null>(null)

  const [filters, setFilters] = useState({
    userId: '', action: '', entityType: '', from: '', to: '',
  })

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ storeId, page: String(p), pageSize: '50' })
      if (filters.userId) params.set('userId', filters.userId)
      if (filters.action) params.set('action', filters.action)
      if (filters.entityType) params.set('entityType', filters.entityType)
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      const res = await fetch(`/api/audit-logs?${params}`)
      const data = (await res.json()) as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal memuat log'); return }
      setEntries(data.items ?? [])
      setTotal(data.total ?? 0)
      setPage(data.page ?? 1)
      setPages(data.pages ?? 1)
    } catch {
      toast.error('Gagal memuat log aktivitas')
    } finally {
      setLoading(false)
    }
  }, [storeId, filters])

  useEffect(() => { load(1) }, [storeId, filters])

  const clearFilters = () => setFilters({ userId: '', action: '', entityType: '', from: '', to: '' })
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowFilters(v => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm border transition-colors',
            showFilters
              ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
              : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-2)] hover:bg-[var(--surface-2)]',
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Filter
          {hasFilters && <span className="ml-1 rounded-full bg-white/30 px-1 text-xs">{Object.values(filters).filter(Boolean).length}</span>}
        </button>
        {hasFilters && (
          <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)]">
            <X className="h-3 w-3" /> Hapus filter
          </button>
        )}
        <span className="ml-auto text-xs text-[var(--text-3)]">{total} entri</span>
        <button
          onClick={() => load(page)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-3)]">User ID</label>
            <input
              value={filters.userId}
              onChange={e => setFilters(f => ({ ...f, userId: e.target.value }))}
              placeholder="user-xxx"
              className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-3)]">Aksi</label>
            <select
              value={filters.action}
              onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
              className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            >
              <option value="">Semua</option>
              {AUDIT_ACTIONS.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-3)]">Entitas</label>
            <select
              value={filters.entityType}
              onChange={e => setFilters(f => ({ ...f, entityType: e.target.value }))}
              className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            >
              <option value="">Semua</option>
              {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-3)]">Dari</label>
            <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
              className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-3)]">Sampai</label>
            <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
              className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--text-3)]" /></div>
      ) : entries.length === 0 ? (
        <EmptyState message="Tidak ada log aktivitas ditemukan" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-1)]">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-3)]">Waktu</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-3)]">User</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-3)]">Aksi</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-3)]">Entitas</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-3)]">IP</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-[var(--text-3)]">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {entries.map(e => (
                <tr key={e.id} className="bg-[var(--surface-0)] hover:bg-[var(--surface-1)] transition-colors">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-3)]">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(e.createdAt)}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--text-2)]">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" />{e.userId.slice(0, 8)}...</span>
                  </td>
                  <td className="px-3 py-2"><ActionBadge action={e.action} /></td>
                  <td className="px-3 py-2 text-xs text-[var(--text-2)]">
                    {e.entityType ? <span>{e.entityType}{e.entityId ? ` #${e.entityId.slice(0, 6)}` : ''}</span> : <span className="text-[var(--text-3)]">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--text-3)]">{e.ipAddress ?? '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {(e.oldValue ?? e.newValue) && (
                      <button onClick={() => setDetail(e)} className="rounded p-1 hover:bg-[var(--surface-2)] text-[var(--text-3)]">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-3)]">Halaman {page} dari {pages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => load(page - 1)}
              className="rounded border border-[var(--border)] p-1 disabled:opacity-40 hover:bg-[var(--surface-2)]">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button disabled={page >= pages} onClick={() => load(page + 1)}
              className="rounded border border-[var(--border)] p-1 disabled:opacity-40 hover:bg-[var(--surface-2)]">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-[var(--text-1)]">Detail Log</h3>
              <button onClick={() => setDetail(null)} className="rounded p-1 hover:bg-[var(--surface-2)]"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex gap-2"><span className="text-[var(--text-3)] w-20">ID:</span><span className="text-[var(--text-2)] font-mono">{detail.id}</span></div>
              <div className="flex gap-2"><span className="text-[var(--text-3)] w-20">Aksi:</span><ActionBadge action={detail.action} /></div>
              <div className="flex gap-2"><span className="text-[var(--text-3)] w-20">User:</span><span className="text-[var(--text-2)] font-mono">{detail.userId}</span></div>
              <div className="flex gap-2"><span className="text-[var(--text-3)] w-20">Waktu:</span><span className="text-[var(--text-2)]">{fmtDate(detail.createdAt)}</span></div>
              {detail.ipAddress && <div className="flex gap-2"><span className="text-[var(--text-3)] w-20">IP:</span><span className="text-[var(--text-2)]">{detail.ipAddress}</span></div>}
              {detail.oldValue && (
                <div>
                  <p className="text-[var(--text-3)] mb-1">Nilai Lama:</p>
                  <pre className="rounded bg-[var(--surface-2)] p-2 text-xs text-[var(--text-2)] overflow-auto max-h-32">{JSON.stringify(detail.oldValue, null, 2)}</pre>
                </div>
              )}
              {detail.newValue && (
                <div>
                  <p className="text-[var(--text-3)] mb-1">Nilai Baru:</p>
                  <pre className="rounded bg-[var(--surface-2)] p-2 text-xs text-[var(--text-2)] overflow-auto max-h-32">{JSON.stringify(detail.newValue, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Security Events Tab ──────────────────────────────────────────────────────

function SecurityEventsTab({ storeId }: { storeId: string }) {
  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [summary, setSummary] = useState<SecuritySummary | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d')

  const [filters, setFilters] = useState({
    type: '' as SecurityEventType | '',
    severity: '' as SecurityEventSeverity | '',
    from: '', to: '',
  })

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/security-events/summary?storeId=${storeId}&period=${period}`)
      const data = (await res.json()) as any
      if (res.ok) setSummary(data)
    } catch {
      // summary is non-critical
    }
  }, [storeId, period])

  const loadEvents = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ storeId, page: String(p), pageSize: '50' })
      if (filters.type) params.set('type', filters.type)
      if (filters.severity) params.set('severity', filters.severity)
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      const res = await fetch(`/api/security-events?${params}`)
      const data = (await res.json()) as any
      if (!res.ok) { toast.error(data.error ?? 'Gagal memuat event'); return }
      setEvents(data.items ?? [])
      setTotal(data.total ?? 0)
      setPage(data.page ?? 1)
      setPages(data.pages ?? 1)
    } catch {
      toast.error('Gagal memuat security events')
    } finally {
      setLoading(false)
    }
  }, [storeId, filters])

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { loadEvents(1) }, [loadEvents])

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Event" value={summary.total} icon={Activity} />
          <StatCard label="Keparahan Tinggi" value={summary.highSeverityCount} icon={AlertTriangle} highlight={summary.highSeverityCount > 0} />
          <StatCard label="Login Gagal" value={summary.byType.find(t => t.type === 'FAILED_LOGIN')?.count ?? 0} icon={Lock} />
          <StatCard label="Override Harga" value={summary.byType.find(t => t.type === 'PRICE_OVERRIDE')?.count ?? 0} icon={TrendingUp} />
        </div>
      )}

      {/* Period + filters toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--text-3)]">Periode:</span>
        {(['7d', '30d', '90d'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs border transition-colors',
              period === p
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-2)] hover:bg-[var(--surface-2)]',
            )}
          >
            {p}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <select
            value={filters.type}
            onChange={e => setFilters(f => ({ ...f, type: e.target.value as SecurityEventType | '' }))}
            className="rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-xs text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          >
            <option value="">Semua tipe</option>
            {SECURITY_EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <select
            value={filters.severity}
            onChange={e => setFilters(f => ({ ...f, severity: e.target.value as SecurityEventSeverity | '' }))}
            className="rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-xs text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          >
            <option value="">Semua severity</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
          <button
            onClick={() => loadEvents(page)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--text-3)]" /></div>
      ) : events.length === 0 ? (
        <EmptyState message="Tidak ada security event ditemukan" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-1)]">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-3)]">Waktu</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-3)]">User</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-3)]">Tipe</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-3)]">Severity</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-3)]">Deskripsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {events.map(e => (
                <tr key={e.id} className={cn(
                  'transition-colors',
                  e.severity === 'HIGH' ? 'bg-red-50/40 dark:bg-red-900/5' : 'bg-[var(--surface-0)] hover:bg-[var(--surface-1)]',
                )}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-3)]">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(e.createdAt)}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--text-2)]">
                    {e.userId ? <span className="flex items-center gap-1"><User className="h-3 w-3" />{e.userId.slice(0, 8)}...</span> : <span className="text-[var(--text-3)]">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-2)]">
                      {e.type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2"><SeverityBadge severity={e.severity} /></td>
                  <td className="px-3 py-2 text-xs text-[var(--text-2)] max-w-xs truncate">{e.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-3)]">Halaman {page} dari {pages} ({total} total)</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => loadEvents(page - 1)}
              className="rounded border border-[var(--border)] p-1 disabled:opacity-40 hover:bg-[var(--surface-2)]">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button disabled={page >= pages} onClick={() => loadEvents(page + 1)}
              className="rounded border border-[var(--border)] p-1 disabled:opacity-40 hover:bg-[var(--surface-2)]">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'audit' | 'security'

export default function AuditLogClient({ storeId }: { storeId: string }) {
  const [tab, setTab] = useState<Tab>('audit')

  return (
    <div className="space-y-4">
      {/* Tab nav */}
      <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-1 w-fit">
        {([
          { id: 'audit', label: 'Log Aktivitas', icon: Activity },
          { id: 'security', label: 'Security Events', icon: Shield },
        ] as { id: Tab; label: string; icon: React.ElementType }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-[var(--surface-0)] text-[var(--text-1)] shadow-sm'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'audit' ? (
        <AuditLogTab storeId={storeId} />
      ) : (
        <SecurityEventsTab storeId={storeId} />
      )}
    </div>
  )
}
