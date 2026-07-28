'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  RefreshCw,
  Plus,
  UtensilsCrossed,
  Pencil,
  Trash2,
  X,
  Check,
  User,
  ShoppingCart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentStore } from '@/context/StoreContext'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TableShape = 'ROUND' | 'SQUARE' | 'RECTANGLE'
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING'

export interface RestaurantTable {
  id: string
  storeId: string
  number: number
  shape: TableShape
  seats: number
  x: number
  y: number
  status: TableStatus
  currentOrderId: string | null
  currentOrderTotal?: number | null
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  TableStatus,
  { label: string; bg: string; border: string; text: string; dot: string; ring: string }
> = {
  AVAILABLE: {
    label: 'Kosong',
    bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    border: 'border-emerald-500/40',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-400',
  },
  OCCUPIED: {
    label: 'Terisi',
    bg: 'bg-red-500/10 hover:bg-red-500/20',
    border: 'border-red-500/40',
    text: 'text-red-700',
    dot: 'bg-red-500',
    ring: 'ring-red-400',
  },
  RESERVED: {
    label: 'Reservasi',
    bg: 'bg-amber-500/10 hover:bg-amber-500/20',
    border: 'border-amber-500/40',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    ring: 'ring-amber-400',
  },
  CLEANING: {
    label: 'Dibersihkan',
    bg: 'bg-gray-500/10 hover:bg-gray-500/20',
    border: 'border-gray-400/40',
    text: 'text-gray-500',
    dot: 'bg-gray-400',
    ring: 'ring-gray-300',
  },
}

// ─── Shape config ─────────────────────────────────────────────────────────────

const SHAPE_CLASSES: Record<TableShape, string> = {
  ROUND: 'rounded-full',
  SQUARE: 'rounded-md',
  RECTANGLE: 'rounded-md',
}

// Grid cell size in px
const CELL = 96

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

// ─── Table Cell on Floor Plan ─────────────────────────────────────────────────

function TableCell({
  table,
  selected,
  currency,
  onSelect,
}: {
  table: RestaurantTable
  selected: boolean
  currency: string
  onSelect: (t: RestaurantTable) => void
}) {
  const cfg = STATUS_CONFIG[table.status]
  const isRect = table.shape === 'RECTANGLE'

  return (
    <button
      type="button"
      onClick={() => onSelect(table)}
      style={{
        gridColumn: `${table.x + 1} / span ${isRect ? 2 : 1}`,
        gridRow: `${table.y + 1} / span 1`,
      }}
      className={cn(
        'relative flex flex-col items-center justify-center gap-0.5 border-2 transition-all duration-150 cursor-pointer select-none',
        SHAPE_CLASSES[table.shape],
        cfg.bg,
        cfg.border,
        selected && `ring-2 ${cfg.ring} ring-offset-1`,
      )}
      aria-label={`Meja ${table.number} — ${cfg.label}`}
      aria-pressed={selected}
    >
      <span className={cn('h-2 w-2 rounded-full', cfg.dot)} aria-hidden="true" />
      <span className={cn('text-lg font-bold tabular-nums leading-none', cfg.text)}>
        {table.number < 10 ? `0${table.number}` : table.number}
      </span>
      <span className={cn('text-[9px] font-semibold uppercase tracking-wider', cfg.text)}>
        {cfg.label}
      </span>
      <span className="text-[9px] text-[var(--text-3)]">{table.seats} kursi</span>
      {table.status === 'OCCUPIED' && table.currentOrderTotal != null && (
        <span className="text-[9px] font-medium text-red-600">
          {fmt(table.currentOrderTotal, currency)}
        </span>
      )}
    </button>
  )
}

// ─── Action Panel ─────────────────────────────────────────────────────────────

function ActionPanel({
  table,
  currency,
  onClose,
  onStatusChange,
  onDelete,
}: {
  table: RestaurantTable
  currency: string
  onClose: () => void
  onStatusChange: (id: string, status: TableStatus) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  const changeStatus = async (s: TableStatus) => {
    setBusy(true)
    await onStatusChange(table.id, s)
    setBusy(false)
    onClose()
  }

  const del = async () => {
    if (!confirm(`Hapus Meja ${table.number}?`)) return
    setBusy(true)
    await onDelete(table.id)
    setBusy(false)
    onClose()
  }

  const cfg = STATUS_CONFIG[table.status]

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-lg w-64">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 rounded-full', cfg.dot)} />
          <span className="font-semibold text-[var(--text-1)]">Meja {table.number}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 hover:bg-[var(--bg-hover)] text-[var(--text-3)]"
          aria-label="Tutup"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1 mb-3 text-xs text-[var(--text-2)]">
        <div>Bentuk: <strong>{table.shape}</strong></div>
        <div>Kursi: <strong>{table.seats}</strong></div>
        <div>Status: <strong className={cfg.text}>{cfg.label}</strong></div>
        {table.currentOrderTotal != null && (
          <div>Total: <strong>{fmt(table.currentOrderTotal, currency)}</strong></div>
        )}
      </div>

      <div className="space-y-1">
        {table.status !== 'AVAILABLE' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => changeStatus('AVAILABLE')}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
          >
            <Check className="h-4 w-4" /> Tandai Kosong
          </button>
        )}
        {table.status !== 'OCCUPIED' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => changeStatus('OCCUPIED')}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            <ShoppingCart className="h-4 w-4" /> Tandai Terisi
          </button>
        )}
        {table.status !== 'RESERVED' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => changeStatus('RESERVED')}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 transition-colors"
          >
            <User className="h-4 w-4" /> Tandai Reservasi
          </button>
        )}
        {table.status !== 'CLEANING' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => changeStatus('CLEANING')}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            <Pencil className="h-4 w-4" /> Tandai Dibersihkan
          </button>
        )}
        <hr className="border-[var(--border)] my-1" />
        <button
          type="button"
          disabled={busy}
          onClick={del}
          className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="h-4 w-4" /> Hapus Meja
        </button>
      </div>
    </div>
  )
}

// ─── Add Table Modal ──────────────────────────────────────────────────────────

function AddTableModal({
  storeId,
  onAdded,
  onClose,
}: {
  storeId: string
  onAdded: () => void
  onClose: () => void
}) {
  const [number, setNumber] = useState('')
  const [shape, setShape] = useState<TableShape>('SQUARE')
  const [seats, setSeats] = useState('4')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const num = parseInt(number, 10)
    if (!num || num < 1 || num > 999) {
      setError('Nomor meja harus antara 1–999')
      return
    }
    const s = parseInt(seats, 10)
    if (!s || s < 1 || s > 20) {
      setError('Kapasitas kursi harus antara 1–20')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, number: num, shape, seats: s }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Gagal membuat meja')
      onAdded()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[var(--text-1)]">Tambah Meja</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-hover)]" aria-label="Tutup">
            <X className="h-4 w-4 text-[var(--text-3)]" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Nomor Meja</label>
            <input
              type="number"
              min={1}
              max={999}
              value={number}
              onChange={e => setNumber(e.target.value)}
              placeholder="1"
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Bentuk</label>
            <div className="flex gap-2">
              {(['ROUND', 'SQUARE', 'RECTANGLE'] as TableShape[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setShape(s)}
                  className={cn(
                    'flex-1 rounded-lg border py-2 text-xs font-medium transition-colors',
                    shape === s
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                      : 'border-[var(--border)] hover:bg-[var(--bg-hover)] text-[var(--text-2)]',
                  )}
                >
                  {s === 'ROUND' ? 'Bulat' : s === 'SQUARE' ? 'Kotak' : 'Persegi Panjang'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Kapasitas Kursi</label>
            <input
              type="number"
              min={1}
              max={20}
              value={seats}
              onChange={e => setSeats(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium hover:bg-[var(--bg-hover)] text-[var(--text-2)]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TableManagementClient() {
  const currentStore = useCurrentStore()
  const storeId = currentStore?.id ?? ''
  const currency = currentStore?.currency ?? 'IDR'

  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  // Polling interval ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTables = useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`/api/tables/status?storeId=${storeId}`)
      if (!res.ok) throw new Error('Gagal memuat data meja')
      const data = await res.json() as RestaurantTable[]
      setTables(Array.isArray(data) ? data : [])
      setError('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchTables()
    // Poll every 15 seconds for real-time updates
    pollRef.current = setInterval(fetchTables, 15_000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchTables])

  const handleStatusChange = async (id: string, status: TableStatus) => {
    await fetch(`/api/tables/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, status }),
    })
    await fetchTables()
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/tables/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, deleted: true }),
    })
    await fetchTables()
  }

  const selectedTable = tables.find(t => t.id === selectedId) ?? null

  // Grid dimensions — auto-fit based on table positions
  const maxX = tables.reduce((m, t) => Math.max(m, t.x + (t.shape === 'RECTANGLE' ? 2 : 1)), 6)
  const maxY = tables.reduce((m, t) => Math.max(m, t.y + 1), 5)
  const gridCols = Math.max(maxX, 6)
  const gridRows = Math.max(maxY, 5)

  // Summary counts
  const counts = {
    AVAILABLE: tables.filter(t => t.status === 'AVAILABLE').length,
    OCCUPIED: tables.filter(t => t.status === 'OCCUPIED').length,
    RESERVED: tables.filter(t => t.status === 'RESERVED').length,
    CLEANING: tables.filter(t => t.status === 'CLEANING').length,
  }
  const occupancyRate = tables.length > 0
    ? Math.round((counts.OCCUPIED / tables.length) * 100)
    : 0

  return (
    <div className="flex h-full flex-col bg-[var(--bg-page)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
        <div className="flex items-center gap-3">
          <UtensilsCrossed className="h-5 w-5 text-amber-600" aria-hidden="true" />
          <div>
            <h1 className="text-base font-semibold text-[var(--text-1)]">Manajemen Meja</h1>
            <p className="text-xs text-[var(--text-3)]">
              {tables.length} meja &middot; {occupancyRate}% terisi
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchTables}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--bg-hover)] transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Meja</span>
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex gap-4 border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-2 text-xs">
        {(Object.entries(STATUS_CONFIG) as [TableStatus, (typeof STATUS_CONFIG)[TableStatus]][]).map(
          ([status, cfg]) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
              <span className="text-[var(--text-2)]">{cfg.label}:</span>
              <span className={cn('font-semibold', cfg.text)}>{counts[status]}</span>
            </span>
          ),
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Floor plan */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-[var(--text-3)] text-sm">
              Memuat...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-40 text-red-500 text-sm">{error}</div>
          ) : tables.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <UtensilsCrossed className="h-10 w-10 text-[var(--text-3)]" />
              <p className="text-sm text-[var(--text-3)]">Belum ada meja. Tambahkan meja pertama.</p>
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Tambah Meja
              </button>
            </div>
          ) : (
            <div
              className="relative inline-grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${gridCols}, ${CELL}px)`,
                gridTemplateRows: `repeat(${gridRows}, ${CELL}px)`,
              }}
              role="grid"
              aria-label="Denah lantai"
            >
              {/* Grid background dots */}
              {Array.from({ length: gridRows * gridCols }).map((_, i) => (
                <div
                  key={i}
                  className="rounded border border-dashed border-[var(--border)]/30 bg-[var(--bg-subtle,transparent)]"
                  style={{ gridColumn: (i % gridCols) + 1, gridRow: Math.floor(i / gridCols) + 1 }}
                  aria-hidden="true"
                />
              ))}
              {tables.map(table => (
                <TableCell
                  key={table.id}
                  table={table}
                  selected={table.id === selectedId}
                  currency={currency}
                  onSelect={t => setSelectedId(prev => (prev === t.id ? null : t.id))}
                />
              ))}
            </div>
          )}
        </div>

        {/* Action panel */}
        {selectedTable && (
          <div className="hidden md:block w-72 border-l border-[var(--border)] bg-[var(--bg-card)] p-4 overflow-y-auto">
            <ActionPanel
              table={selectedTable}
              currency={currency}
              onClose={() => setSelectedId(null)}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          </div>
        )}
      </div>

      {/* Mobile action panel */}
      {selectedTable && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 p-4 bg-[var(--bg-card)] border-t border-[var(--border)] shadow-lg">
          <ActionPanel
            table={selectedTable}
            currency={currency}
            onClose={() => setSelectedId(null)}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
          />
        </div>
      )}

      {/* Add table modal */}
      {showAdd && (
        <AddTableModal
          storeId={storeId}
          onAdded={fetchTables}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
