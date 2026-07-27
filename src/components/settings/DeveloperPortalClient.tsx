'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Code2, Key, Webhook, Copy, Check, RefreshCw, Trash2,
  Plus, Play, ChevronDown, ChevronUp, Eye, EyeOff,
  Clock, AlertCircle, CheckCircle2, XCircle, Book,
} from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ApiKeyInfo {
  key: string
  lastUsedAt: string | null
  createdAt: string
}

interface WebhookEndpoint {
  id: string
  url: string
  events: string[]
  secret: string
  active: boolean
  createdAt: string
}

interface WebhookDelivery {
  id: string
  webhookId: string
  event: string
  status: 'SUCCESS' | 'FAILED'
  responseCode: number | null
  deliveredAt: string
}

interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  description: string
  exampleRequest?: object
  exampleResponse?: object
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  { id: 'order.created', label: 'Pesanan Dibuat', desc: 'Dipicu saat pesanan baru dibuat' },
  { id: 'order.paid', label: 'Pesanan Dibayar', desc: 'Dipicu saat pesanan selesai dibayar' },
  { id: 'product.low_stock', label: 'Stok Menipis', desc: 'Dipicu saat stok produk di bawah ambang batas' },
  { id: 'customer.created', label: 'Pelanggan Baru', desc: 'Dipicu saat pelanggan baru didaftarkan' },
]

const API_DOCS: ApiEndpoint[] = [
  {
    method: 'GET', path: '/api/products',
    description: 'Ambil daftar produk toko',
    exampleRequest: { query: '?storeId=xxx&page=1&limit=20' },
    exampleResponse: { products: [{ id: 'prod_1', name: 'Produk A', price: 10000, stock: 50 }], total: 1 },
  },
  {
    method: 'POST', path: '/api/orders',
    description: 'Buat pesanan baru',
    exampleRequest: { storeId: 'xxx', items: [{ productId: 'prod_1', qty: 2 }], paymentMethod: 'CASH' },
    exampleResponse: { id: 'ord_1', total: 20000, status: 'PAID' },
  },
  {
    method: 'GET', path: '/api/customers',
    description: 'Ambil daftar pelanggan',
    exampleRequest: { query: '?storeId=xxx&search=john' },
    exampleResponse: { customers: [{ id: 'cus_1', name: 'John Doe', points: 150 }], total: 1 },
  },
  {
    method: 'GET', path: '/api/reports',
    description: 'Laporan penjualan',
    exampleRequest: { query: '?storeId=xxx&from=2025-01-01&to=2025-01-31' },
    exampleResponse: { revenue: 5000000, orders: 120, topProducts: [] },
  },
  {
    method: 'POST', path: '/api/webhooks',
    description: 'Daftarkan webhook endpoint',
    exampleRequest: { storeId: 'xxx', url: 'https://myapp.com/webhook', events: ['order.created'] },
    exampleResponse: { id: 'wh_1', secret: 'whsec_...', active: true },
  },
  {
    method: 'DELETE', path: '/api/webhooks/:id',
    description: 'Hapus webhook endpoint',
    exampleRequest: {},
    exampleResponse: { success: true },
  },
]

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-50 text-blue-600 border-blue-100',
  POST: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  PATCH: 'bg-amber-50 text-amber-600 border-amber-100',
  DELETE: 'bg-red-50 text-red-500 border-red-100',
}

const TABS = [
  { id: 'docs', label: 'Dokumentasi API', icon: Book },
  { id: 'keys', label: 'API Key', icon: Key },
  { id: 'webhooks', label: 'Webhook', icon: Webhook },
] as const
type TabId = (typeof TABS)[number]['id']

// ─── Sub-components ─────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy} className="ml-1 p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-3)] transition-colors" title="Salin">
      {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
    </button>
  )
}

function ApiDocsTab() {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--text-3)] mb-4">
        Gunakan API Key Anda di header <code className="bg-[var(--bg-soft)] px-1 rounded text-xs">X-API-Key</code> untuk mengautentikasi setiap request.
      </p>
      {API_DOCS.map(ep => {
        const key = ep.method + ep.path
        const open = expanded === key
        return (
          <div key={key} className="rounded-lg border border-[var(--border)] overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-soft)] transition-colors text-left"
              onClick={() => setExpanded(open ? null : key)}
            >
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${METHOD_COLORS[ep.method]}`}>
                {ep.method}
              </span>
              <code className="text-sm font-mono text-[var(--text-1)]">{ep.path}</code>
              <span className="text-sm text-[var(--text-3)] ml-1 flex-1">{ep.description}</span>
              {open ? <ChevronUp size={14} className="text-[var(--text-3)]" /> : <ChevronDown size={14} className="text-[var(--text-3)]" />}
            </button>
            {open && (
              <div className="border-t border-[var(--border)] bg-[var(--bg-soft)] px-4 py-3 space-y-3">
                {ep.exampleRequest && Object.keys(ep.exampleRequest).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-2)] mb-1">Contoh Request</p>
                    <pre className="text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded p-3 overflow-x-auto text-[var(--text-1)]">
                      {JSON.stringify(ep.exampleRequest, null, 2)}
                    </pre>
                  </div>
                )}
                {ep.exampleResponse && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-2)] mb-1">Contoh Response</p>
                    <pre className="text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded p-3 overflow-x-auto text-[var(--text-1)]">
                      {JSON.stringify(ep.exampleResponse, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ApiKeysTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient()
  const [showKey, setShowKey] = useState(false)
  const [rotating, setRotating] = useState(false)

  const { data, isLoading } = useQuery<ApiKeyInfo>({
    queryKey: ['api-key', storeId],
    queryFn: () => fetch(`/api/settings/api-key?storeId=${storeId}`).then(r => r.json()),
  })

  async function handleRotate() {
    setRotating(true)
    try {
      const res = await fetch('/api/settings/api-key/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Gagal rotate')
      qc.invalidateQueries({ queryKey: ['api-key', storeId] })
      toast.success('API Key berhasil diperbarui')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRotating(false)
    }
  }

  if (isLoading) return <div className="py-8 text-center text-sm text-[var(--text-3)]">Memuat…</div>

  const maskedKey = data?.key ? data.key.slice(0, 8) + '••••••••••••••••••••••••••' : '—'
  const displayKey = showKey ? (data?.key ?? '—') : maskedKey

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--text-1)]">API Key Aktif</h3>
          <button
            onClick={() => setShowKey(v => !v)}
            className="text-xs text-[var(--text-3)] flex items-center gap-1 hover:text-[var(--text-1)] transition-colors"
          >
            {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
            {showKey ? 'Sembunyikan' : 'Tampilkan'}
          </button>
        </div>
        <div className="flex items-center gap-2 bg-[var(--bg-soft)] rounded-lg px-3 py-2 font-mono text-sm text-[var(--text-1)]">
          <span className="flex-1 truncate">{displayKey}</span>
          {data?.key && <CopyButton value={data.key} />}
        </div>
        {data?.lastUsedAt && (
          <p className="mt-2 text-xs text-[var(--text-3)] flex items-center gap-1">
            <Clock size={11} />
            Terakhir digunakan: {new Date(data.lastUsedAt).toLocaleString('id-ID')}
          </p>
        )}
        {data?.createdAt && (
          <p className="mt-0.5 text-xs text-[var(--text-3)] flex items-center gap-1">
            <Clock size={11} />
            Dibuat: {new Date(data.createdAt).toLocaleString('id-ID')}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleRotate}
            disabled={rotating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors disabled:opacity-60"
          >
            <RefreshCw size={13} className={rotating ? 'animate-spin' : ''} />
            {rotating ? 'Memperbarui…' : 'Rotate Key'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-4">
        <p className="text-xs text-[var(--text-2)] font-semibold mb-2">Cara penggunaan</p>
        <pre className="text-xs text-[var(--text-1)] whitespace-pre-wrap">
{`curl https://yourdomain.com/api/products \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}
        </pre>
      </div>
    </div>
  )
}

function WebhooksTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newEvents, setNewEvents] = useState<string[]>(['order.created'])
  const [adding, setAdding] = useState(false)
  const [deliveryWebhookId, setDeliveryWebhookId] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)

  const { data: webhooks = [], isLoading } = useQuery<WebhookEndpoint[]>({
    queryKey: ['webhooks', storeId],
    queryFn: () => fetch(`/api/webhooks?storeId=${storeId}`).then(r => r.json()),
  })

  const { data: deliveries = [] } = useQuery<WebhookDelivery[]>({
    queryKey: ['webhook-deliveries', deliveryWebhookId],
    queryFn: () => fetch(`/api/webhooks/deliveries?webhookId=${deliveryWebhookId}`).then(r => r.json()),
    enabled: !!deliveryWebhookId,
  })

  async function handleAdd() {
    if (!newUrl || newEvents.length === 0) return
    setAdding(true)
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, url: newUrl, events: newEvents }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Gagal menambahkan')
      qc.invalidateQueries({ queryKey: ['webhooks', storeId] })
      setShowAdd(false)
      setNewUrl('')
      setNewEvents(['order.created'])
      toast.success('Webhook berhasil ditambahkan')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Gagal menghapus')
      qc.invalidateQueries({ queryKey: ['webhooks', storeId] })
      toast.success('Webhook dihapus')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function handleTest(id: string) {
    setTesting(id)
    try {
      const res = await fetch(`/api/webhooks/test/${id}`, { method: 'POST' })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Test gagal')
      toast.success('Test payload terkirim')
      qc.invalidateQueries({ queryKey: ['webhook-deliveries', id] })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setTesting(null)
    }
  }

  function toggleEvent(ev: string) {
    setNewEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev])
  }

  if (isLoading) return <div className="py-8 text-center text-sm text-[var(--text-3)]">Memuat…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-3)]">{webhooks.length} webhook terdaftar</p>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-[var(--primary,#f59e0b)] hover:opacity-90 text-white font-medium transition-opacity"
        >
          <Plus size={13} /> Tambah Webhook
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
          <h4 className="text-sm font-semibold text-[var(--text-1)]">Tambah Webhook Baru</h4>
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">URL Endpoint</label>
            <input
              type="url"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="https://myapp.com/webhook"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-2">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map(ev => (
                <label key={ev.id} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newEvents.includes(ev.id)}
                    onChange={() => toggleEvent(ev.id)}
                    className="mt-0.5 accent-amber-500"
                  />
                  <div>
                    <p className="text-xs font-medium text-[var(--text-1)]">{ev.label}</p>
                    <p className="text-xs text-[var(--text-3)]">{ev.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={adding || !newUrl || newEvents.length === 0}
              className="px-4 py-1.5 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium disabled:opacity-60 transition-colors"
            >
              {adding ? 'Menyimpan…' : 'Simpan'}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-1.5 text-sm rounded-lg border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-soft)] transition-colors">
              Batal
            </button>
          </div>
        </div>
      )}

      {webhooks.length === 0 && !showAdd && (
        <div className="py-10 text-center text-sm text-[var(--text-3)]">
          Belum ada webhook. Klik &quot;Tambah Webhook&quot; untuk mulai.
        </div>
      )}

      {webhooks.map(wh => (
        <div key={wh.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-4 py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${wh.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {wh.active ? 'Aktif' : 'Nonaktif'}
                </span>
                <span className="text-sm font-mono text-[var(--text-1)] truncate">{wh.url}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {wh.events.map(ev => (
                  <span key={ev} className="text-xs bg-[var(--bg-soft)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-2)]">{ev}</span>
                ))}
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs text-[var(--text-3)]">
                <span>Secret:</span>
                <code className="font-mono">{wh.secret.slice(0, 12)}…</code>
                <CopyButton value={wh.secret} />
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleTest(wh.id)}
                disabled={testing === wh.id}
                title="Kirim test payload"
                className="p-1.5 rounded-lg hover:bg-[var(--bg-soft)] text-[var(--text-3)] hover:text-emerald-500 transition-colors disabled:opacity-60"
              >
                <Play size={14} className={testing === wh.id ? 'animate-pulse' : ''} />
              </button>
              <button
                onClick={() => setDeliveryWebhookId(deliveryWebhookId === wh.id ? null : wh.id)}
                title="Riwayat pengiriman"
                className={`p-1.5 rounded-lg hover:bg-[var(--bg-soft)] transition-colors ${deliveryWebhookId === wh.id ? 'text-amber-500' : 'text-[var(--text-3)]'}`}
              >
                <Clock size={14} />
              </button>
              <button
                onClick={() => handleDelete(wh.id)}
                title="Hapus webhook"
                className="p-1.5 rounded-lg hover:bg-red-50 text-[var(--text-3)] hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {deliveryWebhookId === wh.id && (
            <div className="border-t border-[var(--border)] bg-[var(--bg-soft)] px-4 py-3">
              <p className="text-xs font-semibold text-[var(--text-2)] mb-2">Riwayat Pengiriman</p>
              {deliveries.length === 0 ? (
                <p className="text-xs text-[var(--text-3)]">Belum ada pengiriman.</p>
              ) : (
                <div className="space-y-1.5">
                  {deliveries.slice(0, 10).map(d => (
                    <div key={d.id} className="flex items-center gap-2 text-xs">
                      {d.status === 'SUCCESS'
                        ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                        : <XCircle size={12} className="text-red-500 shrink-0" />}
                      <span className="text-[var(--text-2)]">{d.event}</span>
                      {d.responseCode && <span className="text-[var(--text-3)]">HTTP {d.responseCode}</span>}
                      <span className="text-[var(--text-3)] ml-auto">{new Date(d.deliveredAt).toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface DeveloperPortalClientProps {
  storeId: string
}

export default function DeveloperPortalClient({ storeId }: DeveloperPortalClientProps) {
  const [tab, setTab] = useState<TabId>('docs')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-amber-500 text-white'
                  : 'text-[var(--text-2)] hover:bg-[var(--bg-soft)]'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      <div>
        {tab === 'docs' && <ApiDocsTab />}
        {tab === 'keys' && <ApiKeysTab storeId={storeId} />}
        {tab === 'webhooks' && <WebhooksTab storeId={storeId} />}
      </div>
    </div>
  )
}
