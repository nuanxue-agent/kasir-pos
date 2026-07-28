'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  ClipboardCheck,
  Play,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  AlertTriangle,
  Plus,
} from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

type StockTakeStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED'

interface StockTakeItem {
  id?: string
  productId: string
  productName: string
  productSku: string | null
  expectedQty: number
  countedQty: number | ''
  variance: number
  notes: string
}

interface StockTake {
  id: string
  storeId: string
  status: StockTakeStatus
  startedAt: string
  completedAt: string | null
  notes: string | null
  items: StockTakeItem[]
}

interface PastStockTake {
  id: string
  status: StockTakeStatus
  startedAt: string
  completedAt: string | null
  totalVariance: number
  itemCount: number
  notes: string | null
}

interface StockTakeClientProps {
  storeId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: StockTakeStatus) {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-500/20 text-gray-400'
    case 'IN_PROGRESS':
      return 'bg-blue-500/20 text-blue-400'
    case 'COMPLETED':
      return 'bg-green-500/20 text-green-400'
  }
}

function statusLabel(status: StockTakeStatus) {
  switch (status) {
    case 'DRAFT':
      return 'Draft'
    case 'IN_PROGRESS':
      return 'Sedang Berjalan'
    case 'COMPLETED':
      return 'Selesai'
  }
}

function calcVariance(expectedQty: number, countedQty: number | ''): number {
  if (countedQty === '') return 0
  return Number(countedQty) - expectedQty
}

// ── History Panel ─────────────────────────────────────────────────────────────

function HistoryPanel({
  sessions,
  onSelect,
  selectedId,
}: {
  sessions: PastStockTake[]
  onSelect: (id: string) => void
  selectedId: string | null
}) {
  if (sessions.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-[var(--text-3)]">
        Belum ada stock take.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {sessions.map(s => (
        <li key={s.id}>
          <button
            onClick={() => onSelect(s.id)}
            className={cn(
              'w-full text-left px-4 py-3 hover:bg-[var(--bg-muted)] transition-colors',
              selectedId === s.id && 'bg-[var(--bg-muted)]',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                  statusBadge(s.status),
                )}
              >
                {statusLabel(s.status)}
              </span>
              <span className="text-xs text-[var(--text-3)]">
                {new Date(s.startedAt).toLocaleDateString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-[var(--text-3)]">
              <span>{s.itemCount} produk</span>
              <span
                className={cn(
                  'font-medium',
                  s.totalVariance === 0
                    ? 'text-green-400'
                    : s.totalVariance > 0
                      ? 'text-blue-400'
                      : 'text-red-400',
                )}
              >
                {s.totalVariance > 0 ? '+' : ''}
                {s.totalVariance} selisih
              </span>
            </div>
            {s.notes && (
              <p className="mt-1 truncate text-xs text-[var(--text-3)]">{s.notes}</p>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function StockTakeClient({ storeId }: StockTakeClientProps) {
  const [active, setActive] = useState<StockTake | null>(null)
  const [items, setItems] = useState<StockTakeItem[]>([])
  const [history, setHistory] = useState<PastStockTake[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [loadingActive, setLoadingActive] = useState(false)
  const [creating, setCreating] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [savingItems, setSavingItems] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [newDescription, setNewDescription] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)

  // ── Load history ──────────────────────────────────────────────────────────

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/stock-takes?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to load history')
      const data = (await res.json()) as PastStockTake[]
      setHistory(data)
      // Auto-resume an IN_PROGRESS session
      const inProgress = data.find(s => s.status === 'IN_PROGRESS')
      if (inProgress && !active) {
        await loadStockTake(inProgress.id)
      }
    } catch {
      toast.error('Gagal memuat riwayat stock take')
    } finally {
      setLoadingHistory(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // ── Load a specific stock-take ────────────────────────────────────────────

  const loadStockTake = async (id: string) => {
    setLoadingActive(true)
    try {
      const res = await fetch(`/api/stock-takes/${id}?storeId=${storeId}`)
      if (!res.ok) throw new Error('Not found')
      const data = (await res.json()) as StockTake
      setActive(data)
      setItems(
        data.items.map(i => ({
          ...i,
          countedQty: i.countedQty === null || i.countedQty === undefined ? '' : i.countedQty,
        })),
      )
    } catch {
      toast.error('Gagal memuat stock take')
    } finally {
      setLoadingActive(false)
    }
  }

  // ── Create new stock-take ─────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newDate) {
      toast.error('Pilih tanggal terlebih dahulu')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/stock-takes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, startedAt: newDate, notes: newDescription || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as any).error ?? 'Gagal membuat stock take')
      }
      const data = (await res.json()) as StockTake
      setActive(data)
      setItems(data.items.map(i => ({ ...i, countedQty: '' })))
      setShowCreateForm(false)
      setNewDescription('')
      await fetchHistory()
      toast.success('Stock take dimulai')
    } catch (e: any) {
      toast.error(e.message ?? 'Gagal membuat stock take')
    } finally {
      setCreating(false)
    }
  }

  // ── Update counted qty ────────────────────────────────────────────────────

  const handleCountChange = useCallback((productId: string, value: string) => {
    const parsed = value === '' ? '' : Math.max(0, parseInt(value, 10))
    if (parsed !== '' && isNaN(parsed as number)) return
    setItems(prev =>
      prev.map(item =>
        item.productId === productId
          ? {
              ...item,
              countedQty: parsed,
              variance: calcVariance(item.expectedQty, parsed),
            }
          : item,
      ),
    )
  }, [])

  const handleItemNoteChange = useCallback((productId: string, note: string) => {
    setItems(prev =>
      prev.map(item => (item.productId === productId ? { ...item, notes: note } : item)),
    )
  }, [])

  // ── Save counts (bulk upsert) ─────────────────────────────────────────────

  const handleSaveCounts = async () => {
    if (!active) return
    setSavingItems(true)
    try {
      const counted = items.filter(i => i.countedQty !== '')
      const res = await fetch(`/api/stock-takes/${active.id}/items?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: counted.map(i => ({
            productId: i.productId,
            countedQty: Number(i.countedQty),
            notes: i.notes,
          })),
        }),
      })
      if (!res.ok) throw new Error('Gagal menyimpan hitungan')
      toast.success('Hitungan disimpan')
      await fetchHistory()
    } catch (e: any) {
      toast.error(e.message ?? 'Gagal menyimpan')
    } finally {
      setSavingItems(false)
    }
  }

  // ── Finalize ──────────────────────────────────────────────────────────────

  const handleFinalize = async () => {
    if (!active) return
    const unfilled = items.filter(i => i.countedQty === '')
    if (unfilled.length > 0) {
      toast.error(`${unfilled.length} produk belum dihitung. Isi 0 jika tidak ada stok.`)
      return
    }
    if (!confirm('Finalisasi akan memposting semua penyesuaian stok. Lanjutkan?')) return

    setFinalizing(true)
    try {
      // First save all counts
      const res1 = await fetch(`/api/stock-takes/${active.id}/items?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({
            productId: i.productId,
            countedQty: Number(i.countedQty),
            notes: i.notes,
          })),
        }),
      })
      if (!res1.ok) throw new Error('Gagal menyimpan hitungan')

      // Then finalize
      const res2 = await fetch(`/api/stock-takes/${active.id}/finalize?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res2.ok) {
        const body = await res2.json().catch(() => ({}))
        throw new Error((body as any).error ?? 'Gagal finalisasi')
      }
      const updated = (await res2.json()) as StockTake
      setActive(updated)
      setItems(updated.items.map(i => ({ ...i, countedQty: i.countedQty })))
      await fetchHistory()
      toast.success('Stock take selesai & stok disesuaikan')
    } catch (e: any) {
      toast.error(e.message ?? 'Gagal finalisasi')
    } finally {
      setFinalizing(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const totalVariance = items.reduce(
    (sum, i) => sum + (i.countedQty === '' ? 0 : i.variance),
    0,
  )
  const filledCount = items.filter(i => i.countedQty !== '').length
  const surplusCount = items.filter(i => i.variance > 0).length
  const shortageCount = items.filter(i => i.variance < 0).length
  const isCompleted = active?.status === 'COMPLETED'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text-1)]">
            <ClipboardCheck className="h-7 w-7" />
            Stock Take
          </h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">
            Hitung fisik stok dan rekonsiliasi dengan sistem
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-2 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-stone-700"
          >
            <History className="h-4 w-4" />
            Riwayat
            {showHistory ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {(!active || isCompleted) && (
            <button
              onClick={() => setShowCreateForm(v => !v)}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
            >
              <Plus className="h-4 w-4" />
              Stock Take Baru
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-1)]">Mulai Stock Take Baru</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-[var(--text-3)]">Tanggal</label>
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-3)]">Deskripsi (opsional)</label>
              <input
                type="text"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="mis. Hitung bulanan Juli 2026"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newDate}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {creating ? 'Memulai…' : 'Mulai'}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg bg-[var(--bg-muted)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-stone-700"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* History panel */}
      {showHistory && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Riwayat Stock Take</h2>
          </div>
          {loadingHistory ? (
            <p className="py-4 text-center text-sm text-[var(--text-3)]">Memuat…</p>
          ) : (
            <HistoryPanel
              sessions={history}
              selectedId={active?.id ?? null}
              onSelect={id => {
                loadStockTake(id)
                setShowHistory(false)
              }}
            />
          )}
        </div>
      )}

      {/* Active stock-take */}
      {active ? (
        <div className="space-y-4">
          {/* Session meta */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <span
              className={cn(
                'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold',
                statusBadge(active.status),
              )}
            >
              {statusLabel(active.status)}
            </span>
            <span className="text-sm text-[var(--text-3)]">
              Dimulai:{' '}
              {new Date(active.startedAt).toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            {active.completedAt && (
              <span className="text-sm text-[var(--text-3)]">
                Selesai:{' '}
                {new Date(active.completedAt).toLocaleString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            {active.notes && (
              <span className="text-sm text-[var(--text-3)] italic">{active.notes}</span>
            )}
            <div className="ml-auto flex items-center gap-4 text-sm">
              <span className="text-[var(--text-3)]">
                {filledCount}/{items.length} dihitung
              </span>
              {surplusCount > 0 && (
                <span className="font-medium text-green-400">+{surplusCount} surplus</span>
              )}
              {shortageCount > 0 && (
                <span className="font-medium text-red-400">-{shortageCount} kurang</span>
              )}
              <span
                className={cn(
                  'font-semibold',
                  totalVariance === 0
                    ? 'text-green-400'
                    : totalVariance > 0
                      ? 'text-blue-400'
                      : 'text-red-400',
                )}
              >
                Total: {totalVariance > 0 ? '+' : ''}
                {totalVariance}
              </span>
            </div>
          </div>

          {/* Action bar */}
          {!isCompleted && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSaveCounts}
                disabled={savingItems || filledCount === 0}
                className="rounded-lg bg-[var(--bg-muted)] px-4 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-stone-700 disabled:opacity-50"
              >
                {savingItems ? 'Menyimpan…' : 'Simpan Hitungan'}
              </button>
              <button
                onClick={handleFinalize}
                disabled={finalizing || filledCount === 0}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {finalizing ? 'Memfinalisasi…' : 'Finalize & Sesuaikan Stok'}
              </button>
              {filledCount < items.length && (
                <span className="flex items-center gap-1 text-sm text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  {items.length - filledCount} produk belum dihitung
                </span>
              )}
            </div>
          )}

          {/* Products table */}
          {loadingActive ? (
            <div className="py-10 text-center text-sm text-[var(--text-3)]">Memuat produk…</div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--text-3)]">
              Tidak ada produk dengan tracking stok aktif.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-muted)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Produk</th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-2)]">Ekspektasi</th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-2)]">Hitungan</th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-2)]">Selisih</th>
                    {!isCompleted && (
                      <th className="px-4 py-3 text-left font-medium text-[var(--text-2)]">Catatan</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {items.map(item => {
                    const variance =
                      item.countedQty === '' ? null : Number(item.countedQty) - item.expectedQty
                    const isSurplus = variance !== null && variance > 0
                    const isShortage = variance !== null && variance < 0

                    return (
                      <tr
                        key={item.productId}
                        className={cn(
                          'transition-colors hover:bg-[var(--bg-muted)]/50',
                          isSurplus && 'bg-green-500/5',
                          isShortage && 'bg-red-500/5',
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-[var(--text-1)]">{item.productName}</div>
                          {item.productSku && (
                            <div className="text-xs text-[var(--text-3)]">SKU: {item.productSku}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--text-2)]">
                          {item.expectedQty}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isCompleted ? (
                            <span className="text-[var(--text-1)]">
                              {item.countedQty === '' ? '—' : item.countedQty}
                            </span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              value={item.countedQty}
                              onChange={e => handleCountChange(item.productId, e.target.value)}
                              placeholder="—"
                              className="w-24 rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-right text-sm text-[var(--text-1)] focus:ring-2 focus:ring-amber-400 focus:outline-none"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {variance === null ? (
                            <span className="text-[var(--text-3)]">—</span>
                          ) : (
                            <span
                              className={cn(
                                'font-semibold',
                                variance === 0 && 'text-[var(--text-2)]',
                                isSurplus && 'text-green-400',
                                isShortage && 'text-red-400',
                              )}
                            >
                              {variance > 0 ? '+' : ''}
                              {variance}
                            </span>
                          )}
                        </td>
                        {!isCompleted && (
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={item.notes}
                              onChange={e => handleItemNoteChange(item.productId, e.target.value)}
                              placeholder="Catatan…"
                              className="w-full rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:ring-2 focus:ring-amber-400 focus:outline-none"
                            />
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : !loadingHistory && !showCreateForm ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-[var(--text-3)]" />
          <p className="text-sm text-[var(--text-3)]">Belum ada stock take aktif.</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
          >
            <Plus className="h-4 w-4" />
            Mulai Stock Take
          </button>
        </div>
      ) : null}
    </div>
  )
}
