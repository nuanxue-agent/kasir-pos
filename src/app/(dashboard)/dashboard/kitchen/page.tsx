'use client'

import { useEffect, useState, useCallback } from 'react'
import { useCurrentStore } from '@/context/StoreContext'
import { ChefHat, RefreshCw, Clock, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────────

type TicketStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'

interface KotItem {
  name: string
  qty: number
  note?: string
  category?: string
}

interface KitchenTicket {
  id: string
  storeId: string
  tableNumber: number
  items: KotItem[]
  status: TicketStatus
  note?: string | null
  createdAt: string
  updatedAt: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function elapsed(createdAt: string): string {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  if (diff < 60) return `${diff}d`
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}j ${mins % 60}m`
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  PENDING: 'Menunggu',
  IN_PROGRESS: 'Diproses',
  COMPLETED: 'Selesai',
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  PENDING: 'border-red-500/60 bg-red-500/10',
  IN_PROGRESS: 'border-amber-500/60 bg-amber-500/10',
  COMPLETED: 'border-emerald-500/60 bg-emerald-500/10',
}

const STATUS_BADGE: Record<TicketStatus, string> = {
  PENDING: 'bg-red-500/20 text-red-400',
  IN_PROGRESS: 'bg-amber-500/20 text-amber-400',
  COMPLETED: 'bg-emerald-500/20 text-emerald-400',
}

const NEXT_STATUS: Record<TicketStatus, TicketStatus | null> = {
  PENDING: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
  COMPLETED: null,
}

const NEXT_LABEL: Record<TicketStatus, string> = {
  PENDING: 'Mulai Proses',
  IN_PROGRESS: 'Tandai Selesai',
  COMPLETED: '',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KitchenPage() {
  const currentStore = useCurrentStore()
  const storeId = currentStore?.id ?? ''

  const [tickets, setTickets] = useState<KitchenTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const fetchTickets = useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`/api/kitchen/tickets?storeId=${storeId}`)
      const data = await res.json() as { data?: KitchenTicket[] }
      if (data.data) setTickets(data.data)
    } catch {
      // silently retry on next interval
    } finally {
      setLoading(false)
      setLastRefresh(new Date())
    }
  }, [storeId])

  // Initial fetch + auto-refresh every 15s
  useEffect(() => {
    fetchTickets()
    const interval = setInterval(fetchTickets, 15_000)
    return () => clearInterval(interval)
  }, [fetchTickets])

  async function advanceStatus(ticket: KitchenTicket) {
    const next = NEXT_STATUS[ticket.status]
    if (!next) return
    setUpdating(ticket.id)
    try {
      await fetch(`/api/kitchen/tickets/${ticket.id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      setTickets(prev =>
        prev.map(t => (t.id === ticket.id ? { ...t, status: next, updatedAt: new Date().toISOString() } : t)),
      )
    } finally {
      setUpdating(null)
    }
  }

  const open = tickets.filter(t => t.status !== 'COMPLETED')
  const completed = tickets.filter(t => t.status === 'COMPLETED')

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ChefHat className="h-7 w-7 text-amber-500" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-bold text-[var(--text-1)]">Dapur — Kitchen Display</h1>
            <p className="text-xs text-[var(--text-3)]">
              Refresh otomatis setiap 15 detik · Terakhir: {lastRefresh.toLocaleTimeString('id-ID')}
            </p>
          </div>
        </div>
        <button
          onClick={fetchTickets}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm font-medium text-[var(--text-2)] transition-colors hover:text-[var(--text-1)]"
          aria-label="Refresh tiket"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-xs">
        {(['PENDING', 'IN_PROGRESS', 'COMPLETED'] as TicketStatus[]).map(s => (
          <span key={s} className={cn('rounded-full px-3 py-1 font-medium', STATUS_BADGE[s])}>
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" aria-hidden="true" />
        </div>
      ) : open.length === 0 && completed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <ChefHat className="h-14 w-14 text-[var(--text-4)]" aria-hidden="true" />
          <p className="text-[var(--text-2)] font-medium">Tidak ada tiket dapur saat ini</p>
          <p className="text-xs text-[var(--text-3)]">Tiket baru akan muncul saat pesanan dine-in dikirim ke dapur</p>
        </div>
      ) : (
        <>
          {/* Open tickets grid */}
          {open.length > 0 && (
            <section aria-label="Tiket aktif">
              <h2 className="text-sm font-semibold text-[var(--text-2)] mb-3">
                Tiket Aktif ({open.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {open.map(ticket => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    onAdvance={advanceStatus}
                    updating={updating === ticket.id}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Completed tickets */}
          {completed.length > 0 && (
            <section aria-label="Tiket selesai">
              <h2 className="text-sm font-semibold text-[var(--text-2)] mb-3">
                Selesai ({completed.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 opacity-60">
                {completed.map(ticket => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    onAdvance={advanceStatus}
                    updating={updating === ticket.id}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

// ─── Ticket card ───────────────────────────────────────────────────────────────

function TicketCard({
  ticket,
  onAdvance,
  updating,
}: {
  ticket: KitchenTicket
  onAdvance: (t: KitchenTicket) => void
  updating: boolean
}) {
  const next = NEXT_STATUS[ticket.status]

  return (
    <article
      className={cn(
        'rounded-xl border-2 p-4 space-y-3 transition-colors',
        STATUS_COLORS[ticket.status],
      )}
      aria-label={`Tiket meja ${ticket.tableNumber}`}
    >
      {/* Card header */}
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-[var(--text-1)]">Meja {ticket.tableNumber}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_BADGE[ticket.status])}>
          {STATUS_LABEL[ticket.status]}
        </span>
      </div>

      {/* Elapsed time */}
      <div className="flex items-center gap-1 text-xs text-[var(--text-3)]">
        <Clock className="h-3 w-3" aria-hidden="true" />
        <span>{elapsed(ticket.createdAt)}</span>
        <span className="text-[var(--text-4)]">·</span>
        <span>{new Date(ticket.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      {/* Items */}
      <ul className="space-y-1.5" aria-label="Daftar item">
        {ticket.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="min-w-[20px] font-bold text-[var(--text-1)]">{item.qty}×</span>
            <div>
              <span className="text-[var(--text-1)]">{item.name}</span>
              {item.note && (
                <p className="text-[10px] text-amber-600 italic">{item.note}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Order note */}
      {ticket.note && (
        <p className="text-xs text-[var(--text-3)] border-t border-[var(--border)] pt-2 italic">
          Catatan: {ticket.note}
        </p>
      )}

      {/* Action button */}
      {next && (
        <button
          onClick={() => onAdvance(ticket)}
          disabled={updating}
          className={cn(
            'w-full rounded-lg py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5',
            ticket.status === 'IN_PROGRESS'
              ? 'bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50'
              : 'bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50',
          )}
        >
          {updating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : ticket.status === 'IN_PROGRESS' ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : null}
          {updating ? 'Memperbarui…' : NEXT_LABEL[ticket.status]}
        </button>
      )}
    </article>
  )
}
