'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Key, Plus, Trash2, Eye, EyeOff, Copy, Check,
  Webhook, RefreshCw, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, XCircle, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  VALID_SCOPES,
  VALID_WEBHOOK_EVENTS,
  validateScopes,
  validateWebhookEvents,
  isKeyExpired,
  aggregateLogStatus,
} from '@/lib/api-keys'

export {
  generateRawApiKey,
  extractKeyPrefix,
  hashApiKey,
  validateScopes,
  filterValidScopes,
  isKeyExpired,
  isKeyActive,
  validateWebhookEvents,
  filterValidWebhookEvents,
  getWebhooksForEvent,
  aggregateLogStatus,
  getRecentLogs,
} from '@/lib/api-keys'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string
  storeId: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  active: boolean
  createdBy: string
  createdAt: string
}

interface Webhook {
  id: string
  storeId: string
  url: string
  events: string[]
  secret: string
  active: boolean
  lastTriggeredAt: string | null
  createdAt: string
}

interface WebhookLog {
  id: string
  webhookId: string
  event: string
  payload: Record<string, unknown>
  status: 'SUCCESS' | 'FAILED'
  responseCode: number | null
  createdAt: string
}

interface ApiKeyClientProps {
  storeId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ active, expired }: { active: boolean; expired?: boolean }) {
  if (!active) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
      <XCircle size={10} /> Dicabut
    </span>
  )
  if (expired) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-400">
      <Clock size={10} /> Kedaluwarsa
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
      <CheckCircle2 size={10} /> Aktif
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="rounded p-1 text-[var(--text-3)] transition hover:text-[var(--text-1)]"
      title="Salin"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}


// ── Create API Key Modal ──────────────────────────────────────────────────────

function CreateKeyModal({ storeId, onClose, onCreated }: {
  storeId: string
  onClose: () => void
  onCreated: (key: ApiKey & { rawKey: string }) => void
}) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>(['orders:read', 'products:read'])
  const [expiresAt, setExpiresAt] = useState('')
  const [loading, setLoading] = useState(false)

  const toggleScope = (scope: string) => {
    setScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Nama API key wajib diisi'); return }
    if (!validateScopes(scopes)) { toast.error('Pilih minimal satu scope yang valid'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/api-keys?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scopes, expiresAt: expiresAt || null }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      onCreated(json)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-[var(--text-1)]">Buat API Key Baru</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Nama</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="mis. Integrasi Website"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] placeholder-[var(--text-3)] outline-none focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text-2)]">Scopes</label>
            <div className="grid grid-cols-2 gap-2">
              {VALID_SCOPES.map(scope => (
                <label key={scope} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-xs text-[var(--text-2)] hover:border-[var(--primary)]">
                  <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} className="accent-[var(--primary)]" />
                  {scope}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Kedaluwarsa (opsional)</label>
            <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--primary)]"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)]">Batal</button>
            <button type="submit" disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Key size={14} />}
              Buat Key
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


// ── New Key Display Modal ─────────────────────────────────────────────────────

function NewKeyDisplay({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-full bg-green-500/10 p-2"><CheckCircle2 className="text-green-400" size={20} /></div>
          <div>
            <h3 className="font-semibold text-[var(--text-1)]">API Key Berhasil Dibuat</h3>
            <p className="text-sm text-[var(--text-3)]">Salin sekarang — tidak akan ditampilkan lagi</p>
          </div>
        </div>
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2">
          <AlertCircle size={14} className="shrink-0 text-yellow-400" />
          <p className="text-xs text-yellow-400">Key ini hanya ditampilkan sekali. Simpan di tempat yang aman.</p>
        </div>
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2">
          <code className="flex-1 overflow-x-auto text-xs text-[var(--text-1)]">{rawKey}</code>
          <CopyButton text={rawKey} />
        </div>
        <button onClick={onClose} className="w-full rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Saya sudah menyimpan key ini
        </button>
      </div>
    </div>
  )
}

// ── Create Webhook Modal ──────────────────────────────────────────────────────

function CreateWebhookModal({ storeId, onClose, onCreated }: {
  storeId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['order.created'])
  const [loading, setLoading] = useState(false)

  const toggleEvent = (ev: string) => {
    setEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) { toast.error('URL webhook wajib diisi'); return }
    if (events.length === 0) { toast.error('Pilih minimal satu event'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/webhooks?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, url: url.trim(), events }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Webhook berhasil didaftarkan')
      onCreated()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-[var(--text-1)]">Daftarkan Webhook</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">Endpoint URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://yourapp.com/webhooks"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-1)] placeholder-[var(--text-3)] outline-none focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text-2)]">Events</label>
            <div className="space-y-2">
              {VALID_WEBHOOK_EVENTS.map(ev => (
                <label key={ev} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-[var(--text-2)] hover:border-[var(--primary)]">
                  <input type="checkbox" checked={events.includes(ev)} onChange={() => toggleEvent(ev)} className="accent-[var(--primary)]" />
                  <span className="font-mono text-xs">{ev}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--bg-2)]">Batal</button>
            <button type="submit" disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Webhook size={14} />}
              Daftarkan
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


// ── Webhook Row ───────────────────────────────────────────────────────────────

function WebhookRow({ webhook, storeId, onRefresh }: {
  webhook: Webhook
  storeId: string
  onRefresh: () => void
}) {
  const [showSecret, setShowSecret] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const qc = useQueryClient()

  const loadLogs = async () => {
    if (!expanded) {
      setLogsLoading(true)
      try {
        const res = await fetch(`/api/webhooks/${webhook.id}/logs`)
        const json = await res.json() as any
        setLogs(json.logs ?? [])
      } finally {
        setLogsLoading(false)
      }
    }
    setExpanded(prev => !prev)
  }

  const toggleActive = async () => {
    const res = await fetch(`/api/webhooks/${webhook.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !webhook.active }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success(webhook.active ? 'Webhook dinonaktifkan' : 'Webhook diaktifkan')
    onRefresh()
  }

  const summary = aggregateLogStatus(logs)

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Webhook size={14} className="text-[var(--primary)] shrink-0" />
            <span className="font-mono text-sm text-[var(--text-1)] truncate">{webhook.url}</span>
            <StatusBadge active={webhook.active} />
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {webhook.events.map(ev => (
              <span key={ev} className="rounded bg-[var(--bg-2)] px-2 py-0.5 font-mono text-xs text-[var(--text-3)]">{ev}</span>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-[var(--text-3)]">Secret:</span>
            <code className="text-xs text-[var(--text-2)]">
              {showSecret ? webhook.secret : '••••••••••••••••'}
            </code>
            <button onClick={() => setShowSecret(p => !p)} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
              {showSecret ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
            {showSecret && <CopyButton text={webhook.secret} />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleActive}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition',
              webhook.active
                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
            )}
          >
            {webhook.active ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
          <button onClick={loadLogs} className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--bg-2)]">
            Log {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--border)] px-4 pb-4 pt-3">
          {logsLoading ? (
            <div className="flex justify-center py-4"><RefreshCw size={16} className="animate-spin text-[var(--text-3)]" /></div>
          ) : logs.length === 0 ? (
            <p className="text-center text-sm text-[var(--text-3)] py-4">Belum ada log pengiriman</p>
          ) : (
            <>
              <div className="mb-3 flex gap-4 text-xs text-[var(--text-3)]">
                <span>Total: <strong className="text-[var(--text-1)]">{summary.total}</strong></span>
                <span className="text-green-400">Sukses: <strong>{summary.success}</strong></span>
                <span className="text-red-400">Gagal: <strong>{summary.failed}</strong></span>
                <span>Tingkat sukses: <strong className="text-[var(--text-1)]">{summary.successRate}%</strong></span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {logs.map(log => (
                  <div key={log.id} className="flex items-center gap-3 rounded-lg bg-[var(--bg-1)] px-3 py-2 text-xs">
                    {log.status === 'SUCCESS'
                      ? <CheckCircle2 size={12} className="shrink-0 text-green-400" />
                      : <XCircle size={12} className="shrink-0 text-red-400" />
                    }
                    <span className="font-mono text-[var(--text-2)]">{log.event}</span>
                    <span className="text-[var(--text-3)]">{log.responseCode ?? '—'}</span>
                    <span className="ml-auto text-[var(--text-3)]">{new Date(log.createdAt).toLocaleString('id-ID')}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}


// ── Main Component ────────────────────────────────────────────────────────────

export default function ApiKeyClient({ storeId }: ApiKeyClientProps) {
  const [tab, setTab] = useState<'keys' | 'webhooks'>('keys')
  const [showCreateKey, setShowCreateKey] = useState(false)
  const [showCreateWebhook, setShowCreateWebhook] = useState(false)
  const [newRawKey, setNewRawKey] = useState<string | null>(null)
  const qc = useQueryClient()

  const keysQuery = useQuery({
    queryKey: ['api-keys', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/api-keys?storeId=${storeId}`)
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json as ApiKey[]
    },
  })

  const webhooksQuery = useQuery({
    queryKey: ['webhooks', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/webhooks?storeId=${storeId}`)
      const json = await res.json() as any
      if (json.error) throw new Error(json.error)
      return json as Webhook[]
    },
  })

  const revokeKey = async (id: string) => {
    if (!confirm('Cabut API key ini? Semua integrasi yang menggunakannya akan berhenti bekerja.')) return
    const res = await fetch(`/api/api-keys/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revoke: true }),
    })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success('API key dicabut')
    qc.invalidateQueries({ queryKey: ['api-keys', storeId] })
  }

  const handleKeyCreated = (key: ApiKey & { rawKey: string }) => {
    setShowCreateKey(false)
    setNewRawKey(key.rawKey)
    qc.invalidateQueries({ queryKey: ['api-keys', storeId] })
  }

  const keys = keysQuery.data ?? []
  const webhooks = webhooksQuery.data ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">API Keys & Webhook</h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">Kelola akses API dan integrasi webhook untuk toko Anda</p>
        </div>
        <button
          onClick={() => tab === 'keys' ? setShowCreateKey(true) : setShowCreateWebhook(true)}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={16} />
          {tab === 'keys' ? 'Buat API Key' : 'Tambah Webhook'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        {([['keys', 'API Keys', Key], ['webhooks', 'Webhooks', Webhook]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition',
              tab === id
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]'
            )}
          >
            <Icon size={15} />
            {label}
            <span className={cn(
              'rounded-full px-1.5 py-0.5 text-xs',
              tab === id ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'bg-[var(--bg-2)] text-[var(--text-3)]'
            )}>
              {id === 'keys' ? keys.length : webhooks.length}
            </span>
          </button>
        ))}
      </div>

      {/* API Keys Tab */}
      {tab === 'keys' && (
        <div className="space-y-3">
          {keysQuery.isLoading ? (
            <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-[var(--text-3)]" /></div>
          ) : keys.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] py-16 text-center">
              <Key size={32} className="mx-auto mb-3 text-[var(--text-3)]" />
              <p className="font-medium text-[var(--text-2)]">Belum ada API key</p>
              <p className="mt-1 text-sm text-[var(--text-3)]">Buat API key untuk mengakses API toko Anda dari aplikasi eksternal</p>
            </div>
          ) : (
            keys.map(key => (
              <div key={key.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Key size={14} className="text-[var(--primary)] shrink-0" />
                      <span className="font-medium text-[var(--text-1)]">{key.name}</span>
                      <StatusBadge active={key.active} expired={isKeyExpired(key.expiresAt)} />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="rounded bg-[var(--bg-2)] px-2 py-0.5 font-mono text-xs text-[var(--text-2)]">
                        {key.keyPrefix}••••••••
                      </code>
                      <CopyButton text={key.keyPrefix} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {key.scopes.map(s => (
                        <span key={s} className="rounded bg-[var(--bg-2)] px-2 py-0.5 font-mono text-xs text-[var(--text-3)]">{s}</span>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--text-3)]">
                      <span>Dibuat oleh: {key.createdBy}</span>
                      {key.lastUsedAt && <span>Terakhir digunakan: {new Date(key.lastUsedAt).toLocaleDateString('id-ID')}</span>}
                      {key.expiresAt && <span>Kedaluwarsa: {new Date(key.expiresAt).toLocaleDateString('id-ID')}</span>}
                    </div>
                  </div>
                  {key.active && (
                    <button
                      onClick={() => revokeKey(key.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20"
                    >
                      <Trash2 size={12} /> Cabut
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Webhooks Tab */}
      {tab === 'webhooks' && (
        <div className="space-y-3">
          {webhooksQuery.isLoading ? (
            <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-[var(--text-3)]" /></div>
          ) : webhooks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] py-16 text-center">
              <Webhook size={32} className="mx-auto mb-3 text-[var(--text-3)]" />
              <p className="font-medium text-[var(--text-2)]">Belum ada webhook</p>
              <p className="mt-1 text-sm text-[var(--text-3)]">Daftarkan endpoint untuk menerima notifikasi real-time dari toko Anda</p>
            </div>
          ) : (
            webhooks.map(webhook => (
              <WebhookRow
                key={webhook.id}
                webhook={webhook}
                storeId={storeId}
                onRefresh={() => qc.invalidateQueries({ queryKey: ['webhooks', storeId] })}
              />
            ))
          )}
        </div>
      )}

      {/* Modals */}
      {showCreateKey && (
        <CreateKeyModal storeId={storeId} onClose={() => setShowCreateKey(false)} onCreated={handleKeyCreated} />
      )}
      {showCreateWebhook && (
        <CreateWebhookModal
          storeId={storeId}
          onClose={() => setShowCreateWebhook(false)}
          onCreated={() => {
            setShowCreateWebhook(false)
            qc.invalidateQueries({ queryKey: ['webhooks', storeId] })
          }}
        />
      )}
      {newRawKey && (
        <NewKeyDisplay rawKey={newRawKey} onClose={() => setNewRawKey(null)} />
      )}
    </div>
  )
}
