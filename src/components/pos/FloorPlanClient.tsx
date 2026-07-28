'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Plus, RefreshCw, Layers, Merge, Scissors, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TableShape = 'SQUARE' | 'ROUND' | 'BAR'
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING'

export interface TableLayout {
  id: string
  storeId: string
  tableId: string
  label: string
  x: number
  y: number
  width: number
  height: number
  shape: TableShape
  floor: number
  capacity: number
  status: TableStatus
  mergedInto: string | null
  active: number
}

interface FloorPlanClientProps {
  storeId: string
  onTableClick?: (table: TableLayout) => void
  editable?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CELL_SIZE = 72 // px per grid unit
const GRID_COLS = 12
const GRID_ROWS = 8

const STATUS_CONFIG: Record<
  TableStatus,
  { label: string; bg: string; border: string; text: string; dot: string }
> = {
  AVAILABLE: {
    label: 'Kosong',
    bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    border: 'border-emerald-500/40 hover:border-emerald-500/70',
    text: 'text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  OCCUPIED: {
    label: 'Terisi',
    bg: 'bg-red-500/10 hover:bg-red-500/20',
    border: 'border-red-500/40 hover:border-red-500/70',
    text: 'text-red-700 dark:text-red-400',
    dot: 'bg-red-500',
  },
  RESERVED: {
    label: 'Reservasi',
    bg: 'bg-amber-500/10 hover:bg-amber-500/20',
    border: 'border-amber-500/40 hover:border-amber-500/70',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  CLEANING: {
    label: 'Dibersihkan',
    bg: 'bg-blue-500/10 hover:bg-blue-500/20',
    border: 'border-blue-500/40 hover:border-blue-500/70',
    text: 'text-blue-700 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
}

const SHAPE_CONFIG: Record<TableShape, { label: string; defaultCapacity: number }> = {
  SQUARE: { label: 'Kotak', defaultCapacity: 4 },
  ROUND: { label: 'Bulat', defaultCapacity: 6 },
  BAR: { label: 'Bar', defaultCapacity: 2 },
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FloorPlanClient({
  storeId,
  onTableClick,
  editable = false,
}: FloorPlanClientProps) {
  const [tables, setTables] = useState<TableLayout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeFloor, setActiveFloor] = useState(1)
  const [floors, setFloors] = useState([1])
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ dx: 0, dy: 0 })
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSelected, setMergeSelected] = useState<string[]>([])
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newTable, setNewTable] = useState({
    label: '',
    shape: 'SQUARE' as TableShape,
    capacity: 4,
    x: 0,
    y: 0,
  })
  const gridRef = useRef<HTMLDivElement>(null)

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTables = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/table-layouts?storeId=${storeId}`)
      if (!res.ok) {
        const d = (await res.json()) as any
        throw new Error(d.error ?? 'Gagal memuat denah meja')
      }
      const data = (await res.json()) as TableLayout[]
      setTables(Array.isArray(data) ? data : [])
      const uniqueFloors = [...new Set(data.map(t => t.floor))].sort((a, b) => a - b)
      if (uniqueFloors.length > 0) setFloors(uniqueFloors)
    } catch (e: any) {
      setError(e.message ?? 'Error')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchTables()
  }, [fetchTables])

  // ─── Floor tables ───────────────────────────────────────────────────────────

  const floorTables = tables.filter(t => t.floor === activeFloor)

  // ─── Drag logic ─────────────────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent, tableId: string) => {
    if (!editable) return
    e.preventDefault()
    const table = tables.find(t => t.id === tableId)
    if (!table) return
    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return
    const mouseX = (e.clientX - rect.left) / CELL_SIZE
    const mouseY = (e.clientY - rect.top) / CELL_SIZE
    setDragging(tableId)
    setDragOffset({ dx: mouseX - table.x, dy: mouseY - table.y })
  }

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !editable) return
      const rect = gridRef.current?.getBoundingClientRect()
      if (!rect) return
      const mouseX = (e.clientX - rect.left) / CELL_SIZE
      const mouseY = (e.clientY - rect.top) / CELL_SIZE
      const newX = Math.max(0, Math.min(GRID_COLS - 1, Math.round(mouseX - dragOffset.dx)))
      const newY = Math.max(0, Math.min(GRID_ROWS - 1, Math.round(mouseY - dragOffset.dy)))
      setTables(prev =>
        prev.map(t => (t.id === dragging ? { ...t, x: newX, y: newY } : t)),
      )
    },
    [dragging, dragOffset, editable],
  )

  const handleMouseUp = useCallback(async () => {
    if (!dragging) return
    const table = tables.find(t => t.id === dragging)
    setDragging(null)
    if (!table) return
    try {
      await fetch(`/api/table-layouts/${table.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: table.x, y: table.y }),
      })
    } catch {
      // optimistic — refetch to sync
      fetchTables()
    }
  }, [dragging, tables, storeId, fetchTables])

  // ─── Add table ──────────────────────────────────────────────────────────────

  const handleAddTable = async () => {
    try {
      const nextLabel =
        newTable.label ||
        `T${tables.filter(t => t.floor === activeFloor).length + 1}`
      const res = await fetch(`/api/table-layouts?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: `table-${Date.now()}`,
          label: nextLabel,
          shape: newTable.shape,
          capacity: newTable.capacity,
          x: newTable.x,
          y: newTable.y,
          width: newTable.shape === 'BAR' ? 2 : 1,
          height: 1,
          floor: activeFloor,
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as any
        throw new Error(d.error ?? 'Gagal menambah meja')
      }
      setAddDialogOpen(false)
      setNewTable({ label: '', shape: 'SQUARE', capacity: 4, x: 0, y: 0 })
      await fetchTables()
    } catch (e: any) {
      setError(e.message ?? 'Error')
    }
  }

  // ─── Merge tables ────────────────────────────────────────────────────────────

  const handleMergeSelect = (tableId: string) => {
    setMergeSelected(prev => {
      if (prev.includes(tableId)) return prev.filter(id => id !== tableId)
      if (prev.length >= 2) return prev
      return [...prev, tableId]
    })
  }

  const handleMerge = async () => {
    if (mergeSelected.length !== 2) return
    try {
      const res = await fetch(`/api/table-layouts/merge?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryId: mergeSelected[0], secondaryId: mergeSelected[1] }),
      })
      if (!res.ok) {
        const d = (await res.json()) as any
        throw new Error(d.error ?? 'Gagal menggabungkan meja')
      }
      setMergeMode(false)
      setMergeSelected([])
      await fetchTables()
    } catch (e: any) {
      setError(e.message ?? 'Error')
    }
  }

  const handleSplit = async (tableId: string) => {
    try {
      const res = await fetch(`/api/table-layouts/merge?storeId=${storeId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryId: tableId }),
      })
      if (!res.ok) {
        const d = (await res.json()) as any
        throw new Error(d.error ?? 'Gagal memisahkan meja')
      }
      await fetchTables()
    } catch (e: any) {
      setError(e.message ?? 'Error')
    }
  }

  // ─── Floor management ────────────────────────────────────────────────────────

  const handleAddFloor = () => {
    const nextFloor = Math.max(...floors) + 1
    setFloors(prev => [...prev, nextFloor])
    setActiveFloor(nextFloor)
  }

  // ─── Table click ─────────────────────────────────────────────────────────────

  const handleTableClick = (table: TableLayout) => {
    if (mergeMode) {
      handleMergeSelect(table.id)
      return
    }
    onTableClick?.(table)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-[var(--bg-page)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-amber-600" aria-hidden="true" />
          <div>
            <h1 className="text-base font-semibold text-[var(--text-1)]">Denah Lantai</h1>
            <p className="text-xs text-[var(--text-3)]">
              {floorTables.length} meja · Lantai {activeFloor}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Legend */}
          <div className="mr-2 hidden items-center gap-3 sm:flex">
            {(Object.entries(STATUS_CONFIG) as [TableStatus, (typeof STATUS_CONFIG)[TableStatus]][]).map(
              ([status, cfg]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', cfg.dot)} aria-hidden="true" />
                  <span className="text-xs text-[var(--text-3)]">{cfg.label}</span>
                </div>
              ),
            )}
          </div>
          <button
            onClick={fetchTables}
            disabled={loading}
            aria-label="Refresh denah"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-muted)] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </button>
          {editable && (
            <>
              <button
                onClick={() => {
                  setMergeMode(m => !m)
                  setMergeSelected([])
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  mergeMode
                    ? 'border-amber-500 bg-amber-500/10 text-amber-700'
                    : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)] hover:bg-[var(--bg-muted)]',
                )}
              >
                <Merge className="h-3.5 w-3.5" aria-hidden="true" />
                {mergeMode ? 'Batal Gabung' : 'Gabung Meja'}
              </button>
              <button
                onClick={() => setAddDialogOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-amber-500/20 transition-opacity hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Tambah Meja
              </button>
            </>
          )}
        </div>
      </div>

      {/* Floor tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-2">
        {floors.map(f => (
          <button
            key={f}
            onClick={() => setActiveFloor(f)}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              activeFloor === f
                ? 'bg-amber-500 text-white'
                : 'text-[var(--text-3)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]',
            )}
          >
            Lantai {f}
          </button>
        ))}
        {editable && (
          <button
            onClick={handleAddFloor}
            className="ml-1 rounded-md px-2 py-1 text-xs text-[var(--text-3)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]"
            aria-label="Tambah lantai baru"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Merge action bar */}
      {mergeMode && (
        <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/5 px-6 py-2 text-sm text-amber-700">
          <span>Pilih 2 meja untuk digabung ({mergeSelected.length}/2)</span>
          {mergeSelected.length === 2 && (
            <button
              onClick={handleMerge}
              className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
            >
              Gabungkan
            </button>
          )}
        </div>
      )}

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
      <div className="flex-1 overflow-auto p-6">
        {loading && tables.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-[var(--text-3)]">
            Memuat denah…
          </div>
        ) : (
          <div
            ref={gridRef}
            role="region"
            aria-label="Denah lantai meja"
            className="relative select-none"
            style={{
              width: GRID_COLS * CELL_SIZE,
              height: GRID_ROWS * CELL_SIZE,
              backgroundImage:
                'radial-gradient(circle, var(--border) 1px, transparent 1px)',
              backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {floorTables.map(table => (
              <TableCell
                key={table.id}
                table={table}
                cellSize={CELL_SIZE}
                dragging={dragging === table.id}
                mergeSelected={mergeSelected.includes(table.id)}
                mergeMode={mergeMode}
                editable={editable}
                onMouseDown={e => handleMouseDown(e, table.id)}
                onClick={() => handleTableClick(table)}
                onSplit={() => handleSplit(table.id)}
              />
            ))}

            {floorTables.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-[var(--text-3)]">
                Belum ada meja di lantai ini.{' '}
                {editable && (
                  <button
                    onClick={() => setAddDialogOpen(true)}
                    className="ml-1 text-amber-600 underline hover:no-underline"
                  >
                    Tambah meja
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add table dialog */}
      {addDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tambah meja baru"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl">
            <h2 className="mb-4 text-base font-semibold text-[var(--text-1)]">Tambah Meja Baru</h2>

            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-[var(--text-2)]">Label Meja</span>
                <input
                  type="text"
                  value={newTable.label}
                  onChange={e => setNewTable(p => ({ ...p, label: e.target.value }))}
                  placeholder="Contoh: T1, VIP-1, Bar-3"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-[var(--text-2)]">Bentuk</span>
                <select
                  value={newTable.shape}
                  onChange={e => {
                    const s = e.target.value as TableShape
                    setNewTable(p => ({
                      ...p,
                      shape: s,
                      capacity: SHAPE_CONFIG[s].defaultCapacity,
                    }))
                  }}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                >
                  {(Object.entries(SHAPE_CONFIG) as [TableShape, (typeof SHAPE_CONFIG)[TableShape]][]).map(
                    ([shape, cfg]) => (
                      <option key={shape} value={shape}>
                        {cfg.label}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-[var(--text-2)]">Kapasitas</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={newTable.capacity}
                  onChange={e => setNewTable(p => ({ ...p, capacity: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-[var(--text-2)]">Posisi X</span>
                  <input
                    type="number"
                    min={0}
                    max={GRID_COLS - 1}
                    value={newTable.x}
                    onChange={e => setNewTable(p => ({ ...p, x: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-[var(--text-2)]">Posisi Y</span>
                  <input
                    type="number"
                    min={0}
                    max={GRID_ROWS - 1}
                    value={newTable.y}
                    onChange={e => setNewTable(p => ({ ...p, y: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setAddDialogOpen(false)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-muted)]"
              >
                Batal
              </button>
              <button
                onClick={handleAddTable}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-amber-500/20 hover:opacity-90"
              >
                Tambah
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Table Cell ───────────────────────────────────────────────────────────────

function TableCell({
  table,
  cellSize,
  dragging,
  mergeSelected,
  mergeMode,
  editable,
  onMouseDown,
  onClick,
  onSplit,
}: {
  table: TableLayout
  cellSize: number
  dragging: boolean
  mergeSelected: boolean
  mergeMode: boolean
  editable: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onClick: () => void
  onSplit: () => void
}) {
  const cfg = STATUS_CONFIG[table.status]
  const isMerged = !!table.mergedInto
  const hasMergedChildren = false // resolved server-side

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Meja ${table.label} — ${cfg.label} — ${table.capacity} kursi`}
      aria-pressed={mergeSelected}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      style={{
        position: 'absolute',
        left: table.x * cellSize,
        top: table.y * cellSize,
        width: table.width * cellSize - 6,
        height: table.height * cellSize - 6,
        cursor: editable && !mergeMode ? 'grab' : 'pointer',
        zIndex: dragging ? 10 : 1,
      }}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border-2 p-2 transition-all',
        cfg.bg,
        cfg.border,
        dragging && 'scale-105 shadow-lg opacity-90',
        mergeSelected && 'ring-2 ring-amber-500 ring-offset-1',
        isMerged && 'opacity-60',
        table.shape === 'ROUND' && 'rounded-full',
        table.shape === 'BAR' && 'rounded-lg',
      )}
      onMouseDown={editable ? onMouseDown : undefined}
      onClick={onClick}
    >
      {/* Status dot */}
      <span className={cn('mb-0.5 h-2 w-2 rounded-full', cfg.dot)} aria-hidden="true" />

      {/* Label */}
      <span className={cn('text-sm font-bold leading-none', cfg.text)}>{table.label}</span>

      {/* Capacity */}
      <span className="mt-0.5 text-[10px] text-[var(--text-3)]">{table.capacity} kursi</span>

      {/* Status */}
      <span className={cn('mt-0.5 text-[9px] font-semibold uppercase tracking-wider', cfg.text)}>
        {cfg.label}
      </span>

      {/* Split button for merged primary tables */}
      {editable && !isMerged && table.status === 'OCCUPIED' && (
        <button
          onClick={e => {
            e.stopPropagation()
            onSplit()
          }}
          aria-label={`Pisahkan meja ${table.label}`}
          className="mt-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium text-[var(--text-3)] hover:bg-black/10"
        >
          <Scissors className="h-2.5 w-2.5" aria-hidden="true" />
          Pisah
        </button>
      )}

      {/* Settings icon on hover for editable */}
      {editable && !mergeMode && (
        <span className="absolute right-1 top-1 hidden group-hover:block" aria-hidden="true">
          <Settings className="h-2.5 w-2.5 text-[var(--text-3)]" />
        </span>
      )}
    </div>
  )
}
