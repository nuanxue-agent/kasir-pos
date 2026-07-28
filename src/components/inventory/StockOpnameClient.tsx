'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  ClipboardList,
  Play,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ScanLine,
  X,
  History,
  AlertTriangle,
} from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  sku?: string | null
  barcode?: string | null
  stock: number
}

interface OpnameItem {
  productId: string
  productName: string
  productSku: string | null
  productBarcode: string | null
  systemQty: number
  countedQty: number | ''
  variance: number
}

type OpnameStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED'

interface OpnameSession {
  id: string
  storeId: string
  status: OpnameStatus
  startedAt: string
  completedAt: string | null
  notes: string | null
  items: OpnameItem[]
}

interface PastSession {
  id: string
  status: OpnameStatus
  startedAt: string
  completedAt: string | null
  totalVariance: number
  itemCount: number
}

interface StockOpnameClientProps {
  storeId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: OpnameStatus) {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-500/20 text-[var(--text-3)]'
    case 'IN_PROGRESS':
      return 'bg-blue-500/20 text-blue-400'
    case 'COMPLETED':
      return 'bg-green-500/20 text-green-400'
  }
}

function statusLabel(status: OpnameStatus) {
  switch (status) {
    case 'DRAFT':
      return 'Draft'
    case 'IN_PROGRESS':
      return 'Sedang Berjalan'
    case 'COMPLETED':
      return 'Selesai'
  }
}

function calcVariance(systemQty: number, countedQty: number | ''): number {
  if (countedQty === '') return 0
  return countedQty - systemQty
}

// ── Session History Panel ─────────────────────────────────────────────────────

interface HistoryPanelProps {
  sessions: PastSession[]
  onSelect: (id: string) => void
  selectedId: string | null
}

function HistoryPanel({ sessions, onSelect, selectedId }: HistoryPanelProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-[var(--text-3)] py-4 text-center">
        Belum ada sesi opname.
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
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function StockOpnameClient({ storeId }: StockOpnameClientProps) {
  const [activeSession, setActiveSession] = useState<OpnameSession | null>(null)
  const [items, setItems] = useState<OpnameItem[]>([])
  const [pastSessions, setPastSessions] = useState<PastSession[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [loadingSession, setLoadingSession] = useState(false)
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const barcodeRef = useRef<HTMLInputElement>(null)

  // ── Load history on mount ─────────────────────────────────────────────────
  useEffect(() => {
    fetchHistory()
  }, [])

  const fetchHistory = async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/stock-opname?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to load history')
      const data = (await res.json()) as PastSession[]
      setPastSessions(data)
      // Resume most recent IN_PROGRESS session
      const inProgress = data.find(s => s.status === 'IN_PROGRESS')
      if (inProgress) {
        await loadSession(inProgress.id)
      }
    } catch {
      toast.error('Gagal memuat riwayat opname')
    } finally {
      setLoadingHistory(false)
    }
  }

  const loadSession = async (sessionId: string) => {
    setLoadingSession(true)
    try {
      const res = await fetch(`/api/stock-opname/${sessionId}?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to load session')
      const data = (await res.json()) as OpnameSession
      setActiveSession(data)
      setItems(
        data.items.map(item => ({
          ...item,
          countedQty: item.countedQty === null || item.countedQty === undefined ? '' : item.countedQty,
        })),
      )
      setNotes(data.notes ?? '')
    } catch {
      toast.error('Gagal memuat sesi opname')
    } finally {
      setLoadingSession(false)
    }
  }

  // ── Start new count ────────────────────────────────────────────────────────
  const handleStartCount = async () => {
    setStarting(true)
    try {
      const res = await fetch('/api/stock-opname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      if (!res.ok) throw new Error('Failed to create session')
      const session = (await res.json()) as OpnameSession
      setActiveSession(session)
      setItems(
        session.items.map(item => ({
          ...item,
          countedQty: '',
        })),
      )
      setNotes('')
      await fetchHistory()
      toast.success('Sesi opname dimulai')
      setTimeout(() => barcodeRef.current?.focus(), 100)
    } catch {
      toast.error('Gagal memulai opname')
    } finally {
      setStarting(false)
    }
  }

  // ── Counted qty change ─────────────────────────────────────────────────────
  const handleCountChange = useCallback((productId: string, value: string) => {
    const parsed = value === '' ? '' : parseInt(value, 10)
    if (parsed !== '' && (isNaN(parsed as number) || (parsed as number) < 0)) return
    setItems(prev =>
      prev.map(item =>
        item.productId === productId
          ? {
              ...item,
              countedQty: parsed,
              variance: calcVariance(item.systemQty, parsed),
            }
          : item,
      ),
    )
  }, [])

  // ── Barcode scan ───────────────────────────────────────────────────────────
  const handleBarcodeScan = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const code = barcodeInput.trim()
      if (!code) return
      const found = items.find(
        item =>
          item.productBarcode === code ||
          item.productSku === code ||
          item.productId === code,
      )
      if (found) {
        setHighlightedId(found.productId)
        const el = rowRefs.current[found.productId]
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          // Focus the count input in that row
          const input = el.querySelector<HTMLInputElement>('input[type="number"]')
          input?.focus()
        }
        setTimeout(() => setHighlightedId(null), 2000)
      } else {
        toast.error(`Produk tidak ditemukan: ${code}`)
      }
      setBarcodeInput('')
    },
    [barcodeInput, items],
  )

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!activeSession) return
    const unfilled = items.filter(i => i.countedQty === '')
    if (unfilled.length > 0) {
      toast.error(`${unfilled.length} produk belum dihitung. Isi 0 jika tidak ada stok.`)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/stock-opname/${activeSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          items: items.map(i => ({
            productId: i.productId,
            countedQty: Number(i.countedQty),
          })),
          notes,
          action: 'submit',
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as any).error ?? 'Submit gagal')
      }
      const updated = (await res.json()) as OpnameSession
      setActiveSession(updated)
      setItems(
        updated.items.map(item => ({
          ...item,
          countedQty: item.countedQty,
        })),
      )
      await fetchHistory()
      toast.success('Opname selesai & stok diperbarui')
    } catch (e: any) {
      toast.error(e.message ?? 'Gagal submit opname')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalVariance = items.reduce((sum, i) => sum + (i.countedQty === '' ? 0 : i.variance), 0)
  const filledCount = items.filter(i => i.countedQty !== '').length
  const isCompleted = activeSession?.status === 'COMPLETED'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text-1)]">
            <ClipboardList className="h-7 w-7" />
            Stock Opname
          </h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">
            Hitung fisik stok dan sesuaikan dengan data sistem
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-2 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-stone-700"
          >
            <History className="h-4 w-4" />
            Riwayat
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {!activeSession || isCompleted ? (
            <button
              onClick={handleStartCount}
              disabled={starting || loadingSession}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {starting ? 'Memulai…' : 'Mulai Hitung'}
            </button>
          ) : null}
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Riwayat Sesi Opname</h2>
          </div>
          {loadingHistory ? (
            <p className="py-4 text-center text-sm text-[var(--text-3)]">Memuat…</p>
          ) : (
            <HistoryPanel
              sessions={pastSessions}
              selectedId={activeSession?.id ?? null}
              onSelect={id => {
                loadSession(id)
                setShowHistory(false)
              }}
            />
          )}
        </div>
      )}

      {/* Active session */}
      {activeSession ? (
        <div className="space-y-4">
          {/* Session meta */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <span
              className={cn(
                'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold',
                statusBadge(activeSession.status),
              )}
            >
              {statusLabel(activeSession.status)}
            </span>
            <span className="text-sm text-[var(--text-3)]">
              Dimulai:{' '}
              {new Date(activeSession.startedAt).toLocaleString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {activeSession.completedAt && (
              <span className="text-sm text-[var(--text-3)]">
                Selesai:{' '}
                {new Date(activeSession.completedAt).toLocaleString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            <span className="ml-auto text-sm text-[var(--text-3)]">
              {filledCount}/{items.length} dihitung
            </span>
            <span
              className={cn(
                'text-sm font-medium',
                totalVariance === 0
                  ? 'text-green-400'
                  : totalVariance > 0
                    ? 'text-blue-400'
                    : 'text-red-400',
              )}
            >
              Selisih: {totalVariance > 0 ? '+' : ''}{totalVariance}
            </span>
          </div>

          {/* Barcode scanner */}
          {!isCompleted && (
            <form onSubmit={handleBarcodeScan} className="flex gap-2">
              <div className="relative flex-1">
                <ScanLine className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
                <input
                  ref={barcodeRef}
                  type="text"
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  placeholder="Scan barcode atau ketik SKU untuk cari produk…"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2 pr-4 pl-10 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:ring-2 focus:ring-amber-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-[var(--bg-muted)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-stone-700"
              >
                Cari
              </button>
            </form>
          )}

          {/* Notes */}
          {!isCompleted && (
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Catatan opname (opsional)…"
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:ring-2 focus:ring-amber-400 focus:outline-none resize-none"
            />
          )}

          {/* Products table */}
          {loadingSession ? (
            <div className="py-10 text-center text-sm text-[var(--text-3)]">Memuat produk…</div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--text-3)]">
              Tidak ada produk yang perlu dihitung.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-3)]">Produk</th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-3)]">
                      Stok Sistem
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-3)]">
                      Hasil Hitung
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--text-3)]">
                      Selisih
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-[var(--text-3)]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {items.map(item => {
                    const variance = calcVariance(item.systemQty, item.countedQty)
                    const counted = item.countedQty !== ''
                    const rowStatus = !counted ? 'pending' : variance === 0 ? 'ok' : 'variance'

                    return (
                      <tr
                        key={item.productId}
                        ref={el => {
                          rowRefs.current[item.productId] = el
                        }}
                        className={cn(
                          'transition-colors',
                          highlightedId === item.productId
                            ? 'bg-amber-500/10'
                            : 'hover:bg-[var(--bg-subtle)]',
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-[var(--text-1)]">{item.productName}</div>
                          {item.productSku && (
                            <div className="text-xs text-[var(--text-3)]">SKU: {item.productSku}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--text-2)]">
                          {item.systemQty}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isCompleted ? (
                            <span className="text-[var(--text-1)]">{item.countedQty}</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              value={item.countedQty}
                              onChange={e => handleCountChange(item.productId, e.target.value)}
                              placeholder="—"
                              className="w-24 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-right text-[var(--text-1)] focus:ring-2 focus:ring-amber-400 focus:outline-none"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {counted ? (
                            <span
                              className={cn(
                                'font-medium',
                                variance === 0
                                  ? 'text-green-400'
                                  : variance > 0
                                    ? 'text-blue-400'
                                    : 'text-red-400',
                              )}
                            >
                              {variance > 0 ? '+' : ''}
                              {variance}
                            </span>
                          ) : (
                            <span className="text-[var(--text-3)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {rowStatus === 'pending' && (
                            <span className="inline-flex items-center rounded-md bg-gray-500/20 px-2 py-0.5 text-xs text-[var(--text-3)]">
                              Belum
                            </span>
                          )}
                          {rowStatus === 'ok' && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
                              <CheckCircle className="h-3 w-3" />
                              OK
                            </span>
                          )}
                          {rowStatus === 'variance' && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
                              <AlertTriangle className="h-3 w-3" />
                              Selisih
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Submit button */}
          {!isCompleted && items.length > 0 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-[var(--text-3)]">
                {filledCount < items.length
                  ? `${items.length - filledCount} produk belum dihitung`
                  : 'Semua produk sudah dihitung'}
              </p>
              <button
                onClick={handleSubmit}
                disabled={submitting || filledCount === 0}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                {submitting ? 'Menyimpan…' : 'Submit Opname'}
              </button>
            </div>
          )}
        </div>
      ) : (
        !loadingSession && (
          <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-[var(--text-3)]" />
            <p className="text-sm font-medium text-[var(--text-2)]">
              Belum ada sesi opname aktif
            </p>
            <p className="mt-1 text-xs text-[var(--text-3)]">
              Klik &quot;Mulai Hitung&quot; untuk memulai penghitungan fisik stok
            </p>
          </div>
        )
      )}
    </div>
  )
}
