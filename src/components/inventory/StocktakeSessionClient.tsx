'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import {
  ClipboardList,
  Play,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Plus,
  Search,
  Download,
  Loader2,
  BarChart3,
} from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

type StocktakeStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED'

interface StocktakeItem {
  id: string
  stocktakeId: string
  productId: string
  productName: string
  productSku: string | null
  systemQty: number
  countedQty: number | null
  variance: number
  notes: string | null
  cost?: number
}

interface Stocktake {
  id: string
  storeId: string
  warehouseId: string | null
  name: string
  status: StocktakeStatus
  startedAt: string
  completedAt: string | null
  completedBy: string | null
  notes: string | null
  itemCount?: number
}

interface StocktakeClientProps {
  storeId: string
  currency: string
}

// ── Pure exported helpers (imported by unit tests) ────────────────────────────

export function calcVariance(systemQty: number, countedQty: number): number {
  return countedQty - systemQty
}

export function calcVariancePct(systemQty: number, countedQty: number): number {
  if (systemQty === 0) return countedQty === 0 ? 0 : Infinity
  return ((countedQty - systemQty) / systemQty) * 100
}

export function calcTotalVarianceValue(
  items: Array<{ countedQty: number | null; variance: number; cost?: number }>,
): number {
  return items.reduce((sum, item) => {
    if (item.countedQty === null) return sum
    return sum + item.variance * (item.cost ?? 0)
  }, 0)
}

export function adjustmentDirection(variance: number): 'surplus' | 'shortage' | 'none' {
  if (variance > 0) return 'surplus'
  if (variance < 0) return 'shortage'
  return 'none'
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function statusBadge(status: StocktakeStatus) {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-500/20 text-[var(--text-3)]'
    case 'IN_PROGRESS':
      return 'bg-blue-500/20 text-blue-400'
    case 'COMPLETED':
      return 'bg-green-500/20 text-green-400'
  }
}

function statusLabel(status: StocktakeStatus) {
  switch (status) {
    case 'DRAFT':       return 'Draft'
    case 'IN_PROGRESS': return 'Sedang Berjalan'
    case 'COMPLETED':   return 'Selesai'
  }
}

// ── History Panel ──────────────────────────────────────────────────────────────

function HistoryPanel({
  sessions,
  onSelect,
  selectedId,
}: {
  sessions: Stocktake[]
  onSelect: (id: string) => void
  selectedId: string | null
}) {
  if (sessions.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-[var(--text-3)]">
        Belum ada stocktake.
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
              <span className="font-medium">{s.name}</span>
              <span>{s.itemCount ?? 0} produk</span>
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

// ── Variance Report Table ──────────────────────────────────────────────────────

function VarianceReport({
  items,
  currency,
}: {
  items: StocktakeItem[]
  currency: string
}) {
  const discrepancies = items.filter(i => i.countedQty !== null && i.variance !== 0)

  if (discrepancies.length === 0) {
    return (
      <div className="py-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-400" />
        <p className="mt-2 text-sm text-[var(--text-2)]">Semua stok sesuai sistem</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-3)]">
            <th className="pb-2">Produk</th>
            <th className="pb-2 text-right">Sistem</th>
            <th className="pb-2 text-right">Hitung</th>
            <th className="pb-2 text-right">Selisih</th>
            <th className="pb-2 text-right">%</th>
            <th className="pb-2 text-right">Nilai</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {discrepancies.map(item => {
            const pct = calcVariancePct(item.systemQty, item.countedQty!)
            const value = item.variance * (item.cost ?? 0)
            return (
              <tr key={item.id} className="text-[var(--text-2)]">
                <td className="py-2">
                  <div className="font-medium">{item.productName}</div>
                  {item.productSku && (
                    <div className="text-xs text-[var(--text-3)]">{item.productSku}</div>
                  )}
                </td>
                <td className="py-2 text-right">{item.systemQty}</td>
                <td className="py-2 text-right">{item.countedQty}</td>
                <td
                  className={cn(
                    'py-2 text-right font-medium',
                    item.variance > 0 ? 'text-blue-400' : 'text-red-400',
                  )}
                >
                  {item.variance > 0 ? '+' : ''}
                  {item.variance}
                </td>
                <td className="py-2 text-right text-xs text-[var(--text-3)]">
                  {pct === Infinity ? '∞' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                </td>
                <td
                  className={cn(
                    'py-2 text-right font-medium',
                    value > 0 ? 'text-blue-400' : 'text-red-400',
                  )}
                >
                  {formatCurrency(value, currency)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function StocktakeClient({ storeId, currency }: StocktakeClientProps) {
  const [sessions, setSessions] = useState<Stocktake[]>([])
  const [active, setActive] = useState<Stocktake | null>(null)
  const [items, setItems] = useState<StocktakeItem[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showVarianceReport, setShowVarianceReport] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  // Create form state
  const [newName, setNewName] = useState('')
  const [newStartedAt, setNewStartedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [newNotes, setNewNotes] = useState('')

  // ── Fetch sessions ───────────────────────────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const res = await fetch(`/api/stocktakes?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed')
      const data = (await res.json()) as any
      const list: Stocktake[] = (Array.isArray(data) ? data : []).map((r: any) => ({
        ...r,
      }))
      setSessions(list)
      // Auto-load in-progress session
      const inProg = list.find(s => s.status === 'IN_PROGRESS')
      if (inProg && !active) {
        await loadSession(inProg.id)
      }
    } catch {
      toast.error('Gagal memuat daftar stocktake')
    } finally {
      setLoadingSessions(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // ── Load a session ───────────────────────────────────────────────────────────

  const loadSession = async (id: string) => {
    setLoadingItems(true)
    try {
      const [sessRes, itemsRes] = await Promise.all([
        fetch(`/api/stocktakes?storeId=${storeId}`),
        fetch(`/api/stocktakes/${id}/items?storeId=${storeId}`),
      ])
      const allSessions = (await sessRes.json()) as any[]
      const sess = allSessions.find((s: any) => s.id === id)
      if (!sess) throw new Error('Not found')
      setActive(sess)
      const rawItems = (await itemsRes.json()) as any[]
      setItems(rawItems.map((i: any) => ({ ...i })))
    } catch {
      toast.error('Gagal memuat data stocktake')
    } finally {
      setLoadingItems(false)
    }
  }

  // ── Create ───────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Nama stocktake wajib diisi"); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/stocktakes?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, startedAt: newStartedAt, notes: newNotes || null }),
      })
      const json = (await res.json()) as any
      if (json.error) { toast.error(json.error); return }
      setActive(json)
      setItems((json.items ?? []).map((i: any) => ({ ...i })))
      setShowCreateForm(false)
      setNewName('')
      setNewNotes('')
      await fetchSessions()
      toast.success('Stocktake dimulai')
    } catch {
      toast.error('Gagal membuat stocktake')
    } finally {
      setSaving(false)
    }
  }

  // ── Update item counted qty ──────────────────────────────────────────────────

  const handleCountChange = useCallback((productId: string, value: string) => {
    const parsed = value === '' ? null : Math.max(0, parseInt(value, 10))
    if (parsed !== null && isNaN(parsed)) return
    setItems(prev =>
      prev.map(item =>
        item.productId === productId
          ? {
              ...item,
              countedQty: parsed,
              variance: parsed === null ? 0 : calcVariance(item.systemQty, parsed),
            }
          : item,
      ),
    )
  }, [])

  const handleNoteChange = useCallback((productId: string, note: string) => {
    setItems(prev =>
      prev.map(item => (item.productId === productId ? { ...item, notes: note } : item)),
    )
  }, [])

  // ── Save counts ──────────────────────────────────────────────────────────────

  const handleSaveCounts = async () => {
    if (!active) return
    setSaving(true)
    try {
      const counted = items.filter(i => i.countedQty !== null)
      const res = await fetch(`/api/stocktakes/${active.id}/items?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: counted.map(i => ({
            productId: i.productId,
            systemQty: i.systemQty,
            countedQty: i.countedQty,
            notes: i.notes,
          })),
        }),
      })
      const json = (await res.json()) as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Hitungan disimpan')
    } catch {
      toast.error('Gagal menyimpan hitungan')
    } finally {
      setSaving(false)
    }
  }

  // ── Apply variances to stock ─────────────────────────────────────────────────

  const handleApply = async () => {
    if (!active) return
    const uncounted = items.filter(i => i.countedQty === null).length
    if (uncounted > 0) {
      toast.error(`${uncounted} produk belum dihitung. Isi 0 jika tidak ada stok.`)
      return
    }
    if (!confirm('Terapkan hasil stocktake? Ini akan memperbarui stok sistem sesuai hitungan fisik.')) return

    setApplying(true)
    try {
      // Save counts first
      await fetch(`/api/stocktakes/${active.id}/items?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({
            productId: i.productId,
            systemQty: i.systemQty,
            countedQty: i.countedQty,
            notes: i.notes,
          })),
        }),
      })

      // Apply
      const res = await fetch(`/api/stocktakes/${active.id}/apply?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = (await res.json()) as any
      if (json.error) { toast.error(json.error); return }
      setActive(json.stocktake)
      await fetchSessions()
      toast.success(`Stocktake selesai — ${json.adjustmentsCreated} penyesuaian stok diterapkan`)
    } catch {
      toast.error('Gagal menerapkan stocktake')
    } finally {
      setApplying(false)
    }
  }

  // ── Advance status ───────────────────────────────────────────────────────────

  const handleAdvanceStatus = async () => {
    if (!active) return
    const nextStatus = active.status === 'DRAFT' ? 'IN_PROGRESS' : null
    if (!nextStatus) return

    try {
      const res = await fetch(`/api/stocktakes/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const json = (await res.json()) as any
      if (json.error) { toast.error(json.error); return }
      setActive(json)
      await fetchSessions()
      toast.success('Status diperbarui')
    } catch {
      toast.error('Gagal memperbarui status')
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const filledCount = items.filter(i => i.countedQty !== null).length
  const surplusCount = items.filter(i => i.variance > 0).length
  const shortageCount = items.filter(i => i.variance < 0).length
  const totalVarianceValue = calcTotalVarianceValue(items)
  const isCompleted = active?.status === 'COMPLETED'

  const filteredItems = items.filter(item => {
    if (!searchQ) return true
    const q = searchQ.toLowerCase()
    return (
      item.productName.toLowerCase().includes(q) ||
      (item.productSku?.toLowerCase().includes(q) ?? false)
    )
  })

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text-1)]">
            <ClipboardList className="h-7 w-7" />
            Stocktake
          </h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">
            Hitung fisik stok dan rekonsiliasi dengan data sistem
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-2 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-stone-700"
          >
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Riwayat ({sessions.length})
          </button>

          {(!active || isCompleted) && (
            <button
              onClick={() => setShowCreateForm(v => !v)}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
            >
              <Plus className="h-4 w-4" />
              Stocktake Baru
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-1)]">Mulai Stocktake Baru</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-[var(--text-3)]">Nama Stocktake</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="mis. Hitung Bulanan Juli 2026"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-3)]">Tanggal</label>
              <input
                type="date"
                value={newStartedAt}
                onChange={e => setNewStartedAt(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-[var(--text-3)]">Catatan (opsional)</label>
              <input
                type="text"
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                placeholder="Keterangan tambahan"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !newName.trim()}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {saving ? 'Memulai...' : 'Mulai'}
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
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Riwayat Stocktake</h2>
          </div>
          {loadingSessions ? (
            <p className="py-4 text-center text-sm text-[var(--text-3)]">Memuat...</p>
          ) : (
            <HistoryPanel
              sessions={sessions}
              selectedId={active?.id ?? null}
              onSelect={id => {
                loadSession(id)
                setShowHistory(false)
              }}
            />
          )}
        </div>
      )}

      {/* Active stocktake */}
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
            <span className="font-medium text-[var(--text-1)]">{active.name}</span>
            <span className="text-sm text-[var(--text-3)]">
              {new Date(active.startedAt).toLocaleDateString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
            </span>
            {active.completedAt && (
              <span className="text-sm text-[var(--text-3)]">
                Selesai:{' '}
                {new Date(active.completedAt).toLocaleDateString('id-ID', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
            )}
            {active.completedBy && (
              <span className="text-sm text-[var(--text-3)]">oleh {active.completedBy}</span>
            )}

            {/* Actions */}
            <div className="ml-auto flex items-center gap-2">
              {active.status === 'DRAFT' && (
                <button
                  onClick={handleAdvanceStatus}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
                >
                  <Play className="h-3.5 w-3.5" />
                  Mulai Hitung
                </button>
              )}
              {active.status === 'IN_PROGRESS' && (
                <>
                  <button
                    onClick={handleSaveCounts}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-muted)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-stone-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Simpan
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={applying}
                    className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Terapkan
                  </button>
                </>
              )}
              <button
                onClick={() => setShowVarianceReport(v => !v)}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-muted)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-stone-700"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Laporan Selisih
              </button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-xs text-[var(--text-3)]">Total Produk</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-1)]">{items.length}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-xs text-[var(--text-3)]">Sudah Dihitung</p>
              <p className="mt-1 text-2xl font-bold text-blue-400">{filledCount}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-xs text-[var(--text-3)]">Surplus / Kurang</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-1)]">
                <span className="text-blue-400">{surplusCount}</span>
                <span className="mx-1 text-sm text-[var(--text-3)]">/</span>
                <span className="text-red-400">{shortageCount}</span>
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-xs text-[var(--text-3)]">Nilai Selisih</p>
              <p
                className={cn(
                  'mt-1 text-lg font-bold',
                  totalVarianceValue > 0
                    ? 'text-blue-400'
                    : totalVarianceValue < 0
                      ? 'text-red-400'
                      : 'text-[var(--text-1)]',
                )}
              >
                {totalVarianceValue > 0 ? '+' : ''}
                {formatCurrency(totalVarianceValue, currency)}
              </p>
            </div>
          </div>

          {/* Variance report */}
          {showVarianceReport && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-[var(--text-1)]">
                  Laporan Selisih ({items.filter(i => i.countedQty !== null && i.variance !== 0).length} item)
                </h2>
              </div>
              <VarianceReport items={items} currency={currency} />
            </div>
          )}

          {/* Count table */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--text-1)]">Daftar Produk</h2>
              <div className="relative ml-auto">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Cari produk..."
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:ring-2 focus:ring-amber-400 focus:outline-none"
                />
              </div>
            </div>

            {loadingItems ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--text-3)]" />
              </div>
            ) : filteredItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--text-3)]">Tidak ada produk ditemukan</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-3)]">
                      <th className="px-4 py-2">Produk</th>
                      <th className="px-4 py-2 text-right">Sistem</th>
                      <th className="px-4 py-2 text-right">Hitung Fisik</th>
                      <th className="px-4 py-2 text-right">Selisih</th>
                      <th className="px-4 py-2">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredItems.map(item => (
                      <tr
                        key={item.id}
                        className={cn(
                          'text-[var(--text-2)] transition-colors',
                          item.variance !== 0 && item.countedQty !== null
                            ? item.variance > 0
                              ? 'bg-blue-500/5'
                              : 'bg-red-500/5'
                            : '',
                        )}
                      >
                        <td className="px-4 py-2">
                          <div className="font-medium text-[var(--text-1)]">{item.productName}</div>
                          {item.productSku && (
                            <div className="text-xs text-[var(--text-3)]">{item.productSku}</div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">{item.systemQty}</td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            disabled={isCompleted}
                            value={item.countedQty ?? ''}
                            onChange={e => handleCountChange(item.productId, e.target.value)}
                            placeholder="—"
                            className={cn(
                              'w-20 rounded-md border bg-[var(--bg-subtle)] px-2 py-1 text-right font-mono text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none',
                              item.countedQty !== null
                                ? 'border-[var(--primary)]'
                                : 'border-[var(--border)]',
                              isCompleted && 'cursor-not-allowed opacity-60',
                            )}
                          />
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-medium">
                          {item.countedQty !== null ? (
                            <span
                              className={cn(
                                item.variance > 0
                                  ? 'text-blue-400'
                                  : item.variance < 0
                                    ? 'text-red-400'
                                    : 'text-green-400',
                              )}
                            >
                              {item.variance > 0 ? '+' : ''}
                              {item.variance}
                            </span>
                          ) : (
                            <span className="text-[var(--text-3)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            disabled={isCompleted}
                            value={item.notes ?? ''}
                            onChange={e => handleNoteChange(item.productId, e.target.value)}
                            placeholder="Catatan..."
                            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-xs text-[var(--text-2)] placeholder:text-[var(--text-3)] focus:ring-2 focus:ring-amber-400 focus:outline-none disabled:opacity-60"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        !loadingSessions && (
          <div className="py-16 text-center">
            <ClipboardList className="mx-auto h-16 w-16 text-[var(--text-3)]" />
            <h2 className="mt-4 text-lg font-semibold text-[var(--text-1)]">
              Belum ada stocktake aktif
            </h2>
            <p className="mt-1 text-sm text-[var(--text-3)]">
              Mulai stocktake baru untuk menghitung fisik stok
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="mt-4 flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 mx-auto"
            >
              <Plus className="h-4 w-4" />
              Stocktake Baru
            </button>
          </div>
        )
      )}
    </div>
  )
}
