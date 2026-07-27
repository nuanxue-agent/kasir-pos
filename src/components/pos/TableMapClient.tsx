'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TableStatus = 'FREE' | 'OCCUPIED' | 'RESERVED'

export interface TableRecord {
  id: string
  storeId: string
  number: number
  status: TableStatus
  currentOrderId: string | null
  currentOrderTotal?: number | null
}

interface TableMapClientProps {
  storeId: string
  currency: string
  /** Called when a FREE table is selected — opens POS with that table */
  onSelectFreeTable: (table: TableRecord) => void
  /** Called when an OCCUPIED table is clicked — shows current order */
  onSelectOccupiedTable: (table: TableRecord) => void
  /** Rows × cols from store settings (default 4×5) */
  rows?: number
  cols?: number
}

// ─── Currency formatter ───────────────────────────────────────────────────────

function fmt(n: number, currency: string) {
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(n)
  } catch {
    return `${currency} ${n}`
  }
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  TableStatus,
  { label: string; bg: string; border: string; text: string; dot: string }
> = {
  FREE: {
    label: 'Kosong',
    bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    border: 'border-emerald-500/30 hover:border-emerald-500/60',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  OCCUPIED: {
    label: 'Terisi',
    bg: 'bg-amber-500/10 hover:bg-amber-500/20',
    border: 'border-amber-500/30 hover:border-amber-500/60',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  RESERVED: {
    label: 'Reservasi',
    bg: 'bg-blue-500/10 hover:bg-blue-500/20',
    border: 'border-blue-500/30 hover:border-blue-500/60',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TableMapClient({
  storeId,
  currency,
  onSelectFreeTable,
  onSelectOccupiedTable,
  rows = 4,
  cols = 5,
}: TableMapClientProps) {
  const [tables, setTables] = useState<TableRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const fetchTables = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/tables?storeId=${storeId}`)
      if (!res.ok) throw new Error('Gagal memuat data meja')
      const data = await res.json()
      setTables(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setError(e.message ?? 'Error')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchTables()
  }, [fetchTables])

  const handleAddTable = async () => {
    setAdding(true)
    try {
      const nextNumber = tables.length > 0 ? Math.max(...tables.map(t => t.number)) + 1 : 1
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, number: nextNumber }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? 'Gagal membuat meja')
      }
      await fetchTables()
    } catch (e: any) {
      setError(e.message ?? 'Error')
    } finally {
      setAdding(false)
    }
  }

  const handleTableClick = (table: TableRecord) => {
    if (table.status === 'FREE') {
      onSelectFreeTable(table)
    } else if (table.status === 'OCCUPIED') {
      onSelectOccupiedTable(table)
    } else {
      // RESERVED — do nothing for now; could show a dialog
    }
  }

  // Build grid slots: pad with nulls up to rows×cols
  const capacity = rows * cols
  const slots: (TableRecord | null)[] = [
    ...tables.slice(0, capacity),
    ...Array(Math.max(0, capacity - tables.length)).fill(null),
  ]

  // Summary counts
  const freeCount = tables.filter(t => t.status === 'FREE').length
  const occupiedCount = tables.filter(t => t.status === 'OCCUPIED').length
  const reservedCount = tables.filter(t => t.status === 'RESERVED').length

  return (
    <div className="flex h-full flex-col bg-[var(--bg-page)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
        <div className="flex items-center gap-3">
          <UtensilsCrossed className="h-5 w-5 text-amber-600" aria-hidden="true" />
          <div>
            <h1 className="text-base font-semibold text-[var(--text-1)]">Peta Meja</h1>
            <p className="text-xs text-[var(--text-3)]">
              {tables.length} meja · {freeCount} kosong · {occupiedCount} terisi
              {reservedCount > 0 ? ` · ${reservedCount} reservasi` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Legend */}
          <div className="mr-2 hidden items-center gap-3 sm:flex">
            {(
              Object.entries(STATUS_CONFIG) as [TableStatus, (typeof STATUS_CONFIG)[TableStatus]][]
            ).map(([status, cfg]) => (
              <div key={status} className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', cfg.dot)} aria-hidden="true" />
                <span className="text-xs text-[var(--text-3)]">{cfg.label}</span>
              </div>
            ))}
          </div>
          <button
            onClick={fetchTables}
            disabled={loading}
            aria-label="Refresh daftar meja"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-muted)] disabled:opacity-50"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
              aria-hidden="true"
            />
            Refresh
          </button>
          <button
            onClick={handleAddTable}
            disabled={adding || loading}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-amber-500/20 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Tambah Meja
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="mx-6 mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-600"
        >
          {error}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && tables.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-[var(--text-3)]">
            Memuat meja…
          </div>
        ) : tables.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-[var(--text-3)]">
            <UtensilsCrossed className="h-10 w-10 opacity-40" />
            <p className="text-sm">Belum ada meja. Klik "Tambah Meja" untuk mulai.</p>
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            role="list"
            aria-label="Daftar meja"
          >
            {slots.map((table, idx) =>
              table ? (
                <TableCard
                  key={table.id}
                  table={table}
                  currency={currency}
                  onClick={() => handleTableClick(table)}
                />
              ) : (
                <div
                  key={`empty-${idx}`}
                  className="aspect-square rounded-xl border border-dashed border-[var(--border)] opacity-30"
                  aria-hidden="true"
                />
              ),
            )}
          </div>
        )}

        {/* Extra tables beyond grid capacity */}
        {tables.length > capacity && (
          <div
            className="mt-4 grid gap-4"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {tables.slice(capacity).map(table => (
              <TableCard
                key={table.id}
                table={table}
                currency={currency}
                onClick={() => handleTableClick(table)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Table Card ───────────────────────────────────────────────────────────────

function TableCard({
  table,
  currency,
  onClick,
}: {
  table: TableRecord
  currency: string
  onClick: () => void
}) {
  const cfg = STATUS_CONFIG[table.status]

  return (
    <button
      onClick={onClick}
      role="listitem"
      aria-label={`Meja ${table.number} — ${cfg.label}${table.currentOrderTotal ? ` — ${fmt(table.currentOrderTotal, currency)}` : ''}`}
      className={cn(
        'relative flex aspect-square flex-col items-center justify-center rounded-xl border-2 p-3 transition-all',
        cfg.bg,
        cfg.border,
        table.status === 'RESERVED' && 'cursor-not-allowed',
      )}
    >
      {/* Status dot */}
      <span className={cn('mb-1.5 h-2 w-2 rounded-full', cfg.dot)} aria-hidden="true" />

      {/* Table number */}
      <span className={cn('text-2xl font-bold tabular-nums', cfg.text)}>
        {formatTableNumber(table.number)}
      </span>

      {/* Status label */}
      <span className={cn('mt-0.5 text-[10px] font-semibold tracking-wider uppercase', cfg.text)}>
        {cfg.label}
      </span>

      {/* Order total if occupied */}
      {table.status === 'OCCUPIED' && table.currentOrderTotal != null && (
        <span className="mt-1 text-[10px] font-medium text-amber-600">
          {fmt(table.currentOrderTotal, currency)}
        </span>
      )}
    </button>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format table number with zero-padding for 1–9 */
export function formatTableNumber(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
