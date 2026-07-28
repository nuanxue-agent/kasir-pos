"use client"

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  MessageSquare, Mail, Phone, Bell, Send, Search, Loader2, X,
  RefreshCw, Filter, ChevronDown, ArrowDownCircle, ArrowUpCircle,
  Clock, CheckCheck, Check, AlertCircle, Plus, User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import { formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'INAPP'
type Direction = 'INBOUND' | 'OUTBOUND'
type CommStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'

interface CommunicationLog {
  id: string
  storeId: string
  customerId: string
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  channel: Channel
  direction: Direction
  subject: string | null
  body: string
  status: CommStatus
  sentAt: string
  metadata: Record<string, unknown> | null
}

interface CommunicationLogClientProps {
  storeId: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_STYLE: Record<Channel, string> = {
  WHATSAPP: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  SMS:      'bg-blue-500/15 text-blue-400 border-blue-500/30',
  EMAIL:    'bg-violet-500/15 text-violet-400 border-violet-500/30',
  INAPP:    'bg-amber-500/15 text-amber-400 border-amber-500/30',
}

const CHANNEL_ICON: Record<Channel, React.ReactNode> = {
  WHATSAPP: <Phone className="h-3.5 w-3.5" />,
  SMS:      <MessageSquare className="h-3.5 w-3.5" />,
  EMAIL:    <Mail className="h-3.5 w-3.5" />,
  INAPP:    <Bell className="h-3.5 w-3.5" />,
}

const STATUS_STYLE: Record<CommStatus, string> = {
  SENT:      'text-blue-400',
  DELIVERED: 'text-emerald-400',
  READ:      'text-violet-400',
  FAILED:    'text-red-400',
}

const STATUS_ICON: Record<CommStatus, React.ReactNode> = {
  SENT:      <Check className="h-3 w-3" />,
  DELIVERED: <CheckCheck className="h-3 w-3" />,
  READ:      <CheckCheck className="h-3 w-3" />,
  FAILED:    <AlertCircle className="h-3 w-3" />,
}

const ALL_CHANNELS: Channel[] = ['WHATSAPP', 'SMS', 'EMAIL', 'INAPP']
const ALL_DIRECTIONS: Direction[] = ['INBOUND', 'OUTBOUND']

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommunicationLogClient({ storeId }: CommunicationLogClientProps) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterChannel, setFilterChannel] = useState<Channel | ''>('')
  const [filterDirection, setFilterDirection] = useState<Direction | ''>('')
  const [filterDate, setFilterDate] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const params = new URLSearchParams({ storeId })
  if (filterChannel) params.set('channel', filterChannel)
  if (filterDirection) params.set('direction', filterDirection)
  if (filterDate) params.set('date', filterDate)

  const { data: logs = [], isLoading, refetch } = useQuery<CommunicationLog[]>({
    queryKey: ['communications', storeId, filterChannel, filterDirection, filterDate],
    queryFn: () => fetch(`/api/communications?${params}`).then(r => r.json() as Promise<CommunicationLog[]>),
  })

  const filtered = logs.filter(l => {
    const q = search.toLowerCase()
    return !q ||
      l.customerName?.toLowerCase().includes(q) ||
      l.customerEmail?.toLowerCase().includes(q) ||
      l.customerPhone?.includes(q) ||
      l.subject?.toLowerCase().includes(q) ||
      l.body.toLowerCase().includes(q)
  })

  // Per-customer timeline view
  const timelineCustomer = selectedCustomerId
    ? filtered.filter(l => l.customerId === selectedCustomerId)
    : null

  const clearFilters = () => {
    setFilterChannel('')
    setFilterDirection('')
    setFilterDate('')
    setSearch('')
  }

  const hasFilters = filterChannel || filterDirection || filterDate || search

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/15">
            <MessageSquare className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-[var(--text-1)]">Communication Log</h1>
            <p className="text-xs text-[var(--text-3)]">Omnichannel customer communication history</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:text-[var(--text-1)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Compose
          </button>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by customer, subject, body…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2 pl-9 pr-3 text-sm text-[var(--text-1)] placeholder-stone-500 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
          />
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
            showFilters || hasFilters
              ? 'border-blue-500/60 bg-blue-500/10 text-blue-400'
              : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)] hover:text-[var(--text-1)]',
          )}
        >
          <Filter className="h-3.5 w-3.5" /> Filters
          {hasFilters && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">!</span>}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Channel */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Channel</label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_CHANNELS.map(ch => (
                  <button
                    key={ch}
                    onClick={() => setFilterChannel(filterChannel === ch ? '' : ch)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors',
                      filterChannel === ch ? CHANNEL_STYLE[ch] : 'border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-2)]',
                    )}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>

            {/* Direction */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Direction</label>
              <div className="flex gap-1.5">
                {ALL_DIRECTIONS.map(d => (
                  <button
                    key={d}
                    onClick={() => setFilterDirection(filterDirection === d ? '' : d)}
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors',
                      filterDirection === d
                        ? d === 'INBOUND'
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                          : 'border-blue-500/40 bg-blue-500/15 text-blue-400'
                        : 'border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-2)]',
                    )}
                  >
                    {d === 'INBOUND' ? <ArrowDownCircle className="h-3 w-3" /> : <ArrowUpCircle className="h-3 w-3" />}
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Date</label>
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-1)] focus:border-blue-500/60 focus:outline-none"
              />
            </div>
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="mt-3 text-xs text-[var(--text-3)] underline hover:text-[var(--text-2)]"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Timeline view for selected customer */}
      {selectedCustomerId && timelineCustomer && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/15">
                <User className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-1)]">
                  {timelineCustomer[0]?.customerName ?? 'Customer'}
                </p>
                <p className="text-[10px] text-[var(--text-3)]">Communication timeline</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedCustomerId(null)}
              className="text-[var(--text-3)] hover:text-[var(--text-1)]"
              aria-label="Close timeline"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative px-4 py-4">
            <div className="absolute left-8 top-0 bottom-0 w-px bg-[var(--border)]" />
            <div className="space-y-4">
              {timelineCustomer.length === 0 ? (
                <p className="py-8 text-center text-xs text-[var(--text-3)]">No messages for this customer.</p>
              ) : (
                timelineCustomer.map(log => (
                  <TimelineItem key={log.id} log={log} />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main log table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <MessageSquare className="mx-auto mb-3 h-8 w-8 text-stone-600" />
          <p className="text-sm font-medium text-[var(--text-2)]">No communications found</p>
          <p className="mt-1 text-xs text-[var(--text-3)]">Try adjusting your filters or compose a new message.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
            <thead>
              <tr className="bg-[var(--bg-subtle)]">
                {['Customer', 'Channel', 'Direction', 'Subject / Body', 'Status', 'Sent At', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--bg-card)]">
              {filtered.map(log => (
                <LogRow
                  key={log.id}
                  log={log}
                  onTimeline={() => setSelectedCustomerId(log.customerId === selectedCustomerId ? null : log.customerId)}
                  isActive={log.customerId === selectedCustomerId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Compose modal */}
      {showCompose && (
        <ComposeModal
          storeId={storeId}
          onClose={() => setShowCompose(false)}
          onDone={() => {
            setShowCompose(false)
            qc.invalidateQueries({ queryKey: ['communications', storeId] })
          }}
        />
      )}
    </div>
  )
}

// ─── Log Row ──────────────────────────────────────────────────────────────────

function LogRow({
  log, onTimeline, isActive,
}: { log: CommunicationLog; onTimeline: () => void; isActive: boolean }) {
  return (
    <tr className={cn('group transition-colors hover:bg-[var(--bg-subtle)]', isActive && 'bg-blue-500/5')}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-subtle)]">
            <User className="h-3.5 w-3.5 text-[var(--text-3)]" />
          </div>
          <div>
            <p className="font-medium text-[var(--text-1)]">{log.customerName ?? 'Unknown'}</p>
            <p className="text-[10px] text-[var(--text-3)]">{log.customerEmail ?? log.customerPhone ?? '—'}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', CHANNEL_STYLE[log.channel])}>
          {CHANNEL_ICON[log.channel]} {log.channel}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
          log.direction === 'INBOUND'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-blue-500/30 bg-blue-500/10 text-blue-400',
        )}>
          {log.direction === 'INBOUND' ? <ArrowDownCircle className="h-3 w-3" /> : <ArrowUpCircle className="h-3 w-3" />}
          {log.direction}
        </span>
      </td>
      <td className="max-w-xs px-4 py-3">
        {log.subject && <p className="text-xs font-medium text-[var(--text-1)] truncate">{log.subject}</p>}
        <p className="truncate text-[11px] text-[var(--text-3)]">{log.body}</p>
      </td>
      <td className="px-4 py-3">
        <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold', STATUS_STYLE[log.status])}>
          {STATUS_ICON[log.status]} {log.status}
        </span>
      </td>
      <td className="px-4 py-3 text-[11px] text-[var(--text-3)] whitespace-nowrap">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDate(log.sentAt)}
        </div>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={onTimeline}
          className={cn(
            'rounded-md border px-2 py-1 text-[10px] font-medium transition-colors',
            isActive
              ? 'border-blue-500/60 bg-blue-500/15 text-blue-400'
              : 'border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-2)]',
          )}
        >
          Timeline
        </button>
      </td>
    </tr>
  )
}

// ─── Timeline Item ────────────────────────────────────────────────────────────

function TimelineItem({ log }: { log: CommunicationLog }) {
  return (
    <div className="relative flex gap-4 pl-8">
      {/* dot */}
      <div className={cn(
        'absolute left-[26px] top-1 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border',
        CHANNEL_STYLE[log.channel],
      )}>
        <span className="scale-75">{CHANNEL_ICON[log.channel]}</span>
      </div>

      <div className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold', CHANNEL_STYLE[log.channel])}>
            {log.channel}
          </span>
          <span className={cn(
            'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold',
            log.direction === 'INBOUND'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-blue-500/30 bg-blue-500/10 text-blue-400',
          )}>
            {log.direction}
          </span>
          <span className={cn('inline-flex items-center gap-0.5 text-[9px] font-semibold', STATUS_STYLE[log.status])}>
            {STATUS_ICON[log.status]} {log.status}
          </span>
          <span className="ml-auto text-[10px] text-[var(--text-3)]">{formatDate(log.sentAt)}</span>
        </div>
        {log.subject && <p className="mb-0.5 text-xs font-semibold text-[var(--text-1)]">{log.subject}</p>}
        <p className="text-xs text-[var(--text-2)]">{log.body}</p>
      </div>
    </div>
  )
}

// ─── Compose Modal ────────────────────────────────────────────────────────────

function ComposeModal({
  storeId, onClose, onDone,
}: { storeId: string; onClose: () => void; onDone: () => void }) {
  const [customerId, setCustomerId] = useState('')
  const [channel, setChannel] = useState<Channel>('INAPP')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    if (!customerId.trim()) { setError('Customer ID is required'); return }
    if (!body.trim()) { setError('Message body is required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          customerId: customerId.trim(),
          channel,
          direction: 'OUTBOUND' as Direction,
          subject: subject.trim() || null,
          body: body.trim(),
          status: 'SENT' as CommStatus,
          metadata: { composedVia: 'dashboard' },
        }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'Failed to log message'); return }
      toast.success('Message logged successfully')
      onDone()
    } catch { setError('Network error') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Compose Message</h2>
          </div>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)]" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-400">
            This logs a communication intent. No message is actually sent to the customer.
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Customer ID <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              placeholder="Customer ID"
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Channel <span className="text-red-400">*</span></label>
            <div className="grid grid-cols-4 gap-1.5">
              {ALL_CHANNELS.map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border py-2 text-[10px] font-semibold transition-colors',
                    channel === ch ? CHANNEL_STYLE[ch] : 'border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-2)]',
                  )}
                >
                  {CHANNEL_ICON[ch]}
                  {ch === 'INAPP' ? 'In-App' : ch.charAt(0) + ch.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Optional subject"
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Message <span className="text-red-400">*</span></label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              placeholder="Enter message body…"
              className={cn(inputCls, 'resize-none')}
            />
          </div>

          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className={cancelBtnCls}>Cancel</button>
            <button onClick={handle} disabled={saving || !customerId || !body} className={primaryBtnCls}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Send className="h-3.5 w-3.5" /> Log Message
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-1)] placeholder-stone-500 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 focus:outline-none'
const cancelBtnCls = 'flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] py-2.5 text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-1)]'
const primaryBtnCls = 'flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
