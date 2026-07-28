'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from '@/components/ui/Toaster'

type QueueStatus = 'WAITING' | 'CALLED' | 'SERVING' | 'COMPLETED' | 'CANCELLED'
type QueuePriority = 'NORMAL' | 'HIGH'

interface QueueToken {
  id: string
  storeId: string
  tokenNumber: number
  customerName: string | null
  customerPhone: string | null
  serviceType: string
  status: QueueStatus
  priority: QueuePriority
  joinedAt: string
  calledAt: string | null
  completedAt: string | null
}

interface QueueStats {
  waiting: number
  called: number
  serving: number
  completed: number
  cancelled: number
  avgServiceMinutes: number
  estimatedWaitMinutes: number
  totalToday: number
}

const STATUS_COLORS: Record<QueueStatus, string> = {
  WAITING:   'bg-yellow-100 text-yellow-800 border-yellow-300',
  CALLED:    'bg-blue-100 text-blue-800 border-blue-300',
  SERVING:   'bg-green-100 text-green-800 border-green-300',
  COMPLETED: 'bg-gray-100 text-gray-600 border-gray-300',
  CANCELLED: 'bg-red-100 text-red-700 border-red-300',
}

const STATUS_LABELS: Record<QueueStatus, string> = {
  WAITING:   'Menunggu',
  CALLED:    'Dipanggil',
  SERVING:   'Dilayani',
  COMPLETED: 'Selesai',
  CANCELLED: 'Batal',
}

const SERVICE_TYPES = ['GENERAL', 'KASIR', 'CUSTOMER_SERVICE', 'TEKNIS', 'KONSULTASI']

function pad(n: number) { return String(n).padStart(3, '0') }

function formatTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export default function QueueClient({ storeId }: { storeId: string }) {
  const [tokens, setTokens] = useState<QueueToken[]>([])
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'board' | 'list' | 'take'>('board')

  // Take-a-token form
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    serviceType: 'GENERAL',
    priority: 'NORMAL' as QueuePriority,
  })
  const [submitting, setSubmitting] = useState(false)
  const [newToken, setNewToken] = useState<QueueToken | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [tokensRes, statsRes] = await Promise.all([
        fetch(`/api/queue-tokens?storeId=${storeId}`),
        fetch(`/api/queue-tokens/stats?storeId=${storeId}`),
      ])
      if (tokensRes.ok) setTokens((await tokensRes.json()) as QueueToken[])
      if (statsRes.ok) setStats((await statsRes.json()) as QueueStats)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 15000)
    return () => clearInterval(interval)
  }, [fetchAll])

  const activeTokens = tokens.filter(t => t.status === 'SERVING' || t.status === 'CALLED')
  const waitingTokens = tokens.filter(t => t.status === 'WAITING')

  async function callNext(serviceType?: string) {
    try {
      const res = await fetch('/api/queue-tokens/call-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, serviceType }),
      })
      const data = await res.json() as { error?: string; tokenNumber?: number }
      if (!res.ok) { toast.error(data.error ?? 'Gagal memanggil token'); return }
      toast.success(`Token #${pad(data.tokenNumber!)} dipanggil`)
      fetchAll()
    } catch {
      toast.error('Gagal memanggil token')
    }
  }

  async function updateStatus(id: string, status: QueueStatus) {
    try {
      const res = await fetch(`/api/queue-tokens/${id}?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, storeId }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { toast.error(data.error ?? 'Gagal update status'); return }
      toast.success(`Status diperbarui ke ${STATUS_LABELS[status]}`)
      fetchAll()
    } catch {
      toast.error('Gagal update status')
    }
  }

  async function takeToken() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/queue-tokens?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json() as { error?: string } & Partial<QueueToken>
      if (!res.ok) { toast.error(data.error ?? 'Gagal ambil token'); return }
      toast.success(`Token #${pad(data.tokenNumber!)} berhasil diambil`)
      setNewToken(data as QueueToken)
      setForm({ customerName: '', customerPhone: '', serviceType: 'GENERAL', priority: 'NORMAL' })
      fetchAll()
    } catch {
      toast.error('Gagal ambil token')
    } finally {
      setSubmitting(false)
    }
  }

  const TABS = [
    { key: 'board', label: 'Papan Antrian' },
    { key: 'list',  label: 'Daftar Lengkap' },
    { key: 'take',  label: 'Ambil Token' },
  ] as const

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Sistem Antrian</h1>
          <p className="text-sm text-[var(--text-2)] mt-0.5">Kelola antrian pelanggan secara digital</p>
        </div>
        <button
          onClick={fetchAll}
          className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-card)] transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Menunggu',    value: stats.waiting,   color: 'text-yellow-600' },
            { label: 'Dilayani',    value: stats.serving + stats.called, color: 'text-green-600' },
            { label: 'Selesai Hari Ini', value: stats.completed, color: 'text-blue-600' },
            { label: 'Est. Tunggu', value: `${stats.estimatedWaitMinutes} mnt`, color: 'text-purple-600' },
          ].map(s => (
            <div key={s.label} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-3">
              <p className="text-xs text-[var(--text-2)]">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Board Tab */}
      {tab === 'board' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Active / Serving */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-[var(--text-1)]">Sedang Dilayani</h2>
              <button
                onClick={() => callNext()}
                className="px-3 py-1 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
              >
                + Panggil Berikutnya
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-[var(--text-2)]">Memuat…</p>
            ) : activeTokens.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-2)]">
                <div className="text-4xl mb-2">🎯</div>
                <p className="text-sm">Tidak ada token aktif</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {activeTokens.map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-green-200 bg-green-50">
                    <div className="text-3xl font-black text-green-700 w-16 text-center">
                      #{pad(t.tokenNumber)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--text-1)] truncate">
                        {t.customerName ?? 'Pelanggan'}
                      </p>
                      <p className="text-xs text-[var(--text-2)]">{t.serviceType} · Dipanggil {formatTime(t.calledAt)}</p>
                    </div>
                    <div className="flex gap-1.5">
                      {t.status === 'CALLED' && (
                        <button
                          onClick={() => updateStatus(t.id, 'SERVING')}
                          className="px-2.5 py-1 rounded-md bg-green-600 text-white text-xs hover:bg-green-700 transition-colors"
                        >
                          Layani
                        </button>
                      )}
                      {(t.status === 'CALLED' || t.status === 'SERVING') && (
                        <button
                          onClick={() => updateStatus(t.id, 'COMPLETED')}
                          className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700 transition-colors"
                        >
                          Selesai
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Waiting Queue */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <h2 className="font-semibold text-[var(--text-1)] mb-3">
              Antrean Berikutnya
              {waitingTokens.length > 0 && (
                <span className="ml-2 text-xs font-normal text-[var(--text-2)]">
                  ({waitingTokens.length} menunggu)
                </span>
              )}
            </h2>

            {loading ? (
              <p className="text-sm text-[var(--text-2)]">Memuat…</p>
            ) : waitingTokens.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-2)]">
                <div className="text-4xl mb-2">✅</div>
                <p className="text-sm">Tidak ada antrean</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                {waitingTokens.slice(0, 10).map((t, idx) => (
                  <div key={t.id} className={`flex items-center gap-3 p-3 rounded-lg border ${
                    t.priority === 'HIGH' ? 'border-orange-200 bg-orange-50' : 'border-[var(--border)] bg-[var(--bg-base)]'
                  }`}>
                    <div className={`text-xl font-black w-12 text-center ${idx === 0 ? 'text-yellow-600' : 'text-[var(--text-2)]'}`}>
                      #{pad(t.tokenNumber)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-1)] truncate">
                        {t.customerName ?? 'Pelanggan'}
                        {t.priority === 'HIGH' && (
                          <span className="ml-1 text-xs text-orange-600 font-bold">PRIORITAS</span>
                        )}
                      </p>
                      <p className="text-xs text-[var(--text-2)]">
                        {t.serviceType} · Masuk {formatTime(t.joinedAt)}
                        {stats && idx === 0 && <span className="ml-1 text-green-600">· Berikutnya!</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => updateStatus(t.id, 'CANCELLED')}
                      className="p-1 rounded text-[var(--text-2)] hover:text-red-600 text-xs transition-colors"
                      title="Batalkan token"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {waitingTokens.length > 10 && (
                  <p className="text-xs text-center text-[var(--text-2)] py-1">
                    +{waitingTokens.length - 10} lainnya — lihat tab Daftar Lengkap
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Call by Service Type */}
          {SERVICE_TYPES.length > 1 && (
            <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
              <h2 className="font-semibold text-[var(--text-1)] mb-3">Panggil Berdasarkan Jenis Layanan</h2>
              <div className="flex flex-wrap gap-2">
                {SERVICE_TYPES.map(st => {
                  const count = waitingTokens.filter(t => t.serviceType === st).length
                  return (
                    <button
                      key={st}
                      onClick={() => callNext(st)}
                      disabled={count === 0}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--bg-base)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="text-[var(--text-1)]">{st}</span>
                      <span className="text-xs bg-[var(--bg-base)] px-1.5 py-0.5 rounded-full text-[var(--text-2)]">{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* List Tab */}
      {tab === 'list' && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-base)]">
                  {['Token', 'Pelanggan', 'Layanan', 'Prioritas', 'Status', 'Masuk', 'Dipanggil', 'Selesai', 'Aksi'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-[var(--text-2)] uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="text-center py-8 text-[var(--text-2)]">Memuat…</td></tr>
                ) : tokens.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-[var(--text-2)]">Belum ada token hari ini</td></tr>
                ) : (
                  tokens.map(t => (
                    <tr key={t.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-base)] transition-colors">
                      <td className="px-3 py-2 font-bold text-[var(--text-1)]">#{pad(t.tokenNumber)}</td>
                      <td className="px-3 py-2 text-[var(--text-1)]">
                        <div>{t.customerName ?? '—'}</div>
                        {t.customerPhone && <div className="text-xs text-[var(--text-2)]">{t.customerPhone}</div>}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-2)]">{t.serviceType}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {t.priority === 'HIGH' ? 'Prioritas' : 'Normal'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[t.status]}`}>
                          {STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[var(--text-2)]">{formatTime(t.joinedAt)}</td>
                      <td className="px-3 py-2 text-[var(--text-2)]">{formatTime(t.calledAt)}</td>
                      <td className="px-3 py-2 text-[var(--text-2)]">{formatTime(t.completedAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {t.status === 'WAITING' && (
                            <button onClick={() => updateStatus(t.id, 'CANCELLED')} className="text-xs text-red-600 hover:underline">Batal</button>
                          )}
                          {t.status === 'CALLED' && (
                            <>
                              <button onClick={() => updateStatus(t.id, 'SERVING')} className="text-xs text-green-600 hover:underline">Layani</button>
                              <button onClick={() => updateStatus(t.id, 'CANCELLED')} className="text-xs text-red-600 hover:underline ml-1">Batal</button>
                            </>
                          )}
                          {t.status === 'SERVING' && (
                            <button onClick={() => updateStatus(t.id, 'COMPLETED')} className="text-xs text-blue-600 hover:underline">Selesai</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Take Token Tab */}
      {tab === 'take' && (
        <div className="max-w-md">
          {newToken ? (
            <div className="bg-[var(--bg-card)] border-2 border-green-400 rounded-2xl p-6 text-center">
              <div className="text-6xl font-black text-green-600 mb-2">#{pad(newToken.tokenNumber)}</div>
              <p className="text-lg font-semibold text-[var(--text-1)] mb-1">Token Anda</p>
              <p className="text-sm text-[var(--text-2)] mb-1">{newToken.serviceType}</p>
              {newToken.customerName && <p className="text-sm text-[var(--text-2)]">{newToken.customerName}</p>}
              <div className="mt-4 p-3 bg-[var(--bg-base)] rounded-lg">
                <p className="text-xs text-[var(--text-2)]">Posisi dalam antrean</p>
                <p className="text-2xl font-bold text-[var(--text-1)]">
                  #{waitingTokens.findIndex(t => t.id === newToken.id) + 1}
                </p>
                {stats && (
                  <p className="text-xs text-[var(--text-2)] mt-1">
                    Estimasi tunggu: ~{stats.estimatedWaitMinutes} menit
                  </p>
                )}
              </div>
              <button
                onClick={() => setNewToken(null)}
                className="mt-4 w-full py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-2)] hover:bg-[var(--bg-base)] transition-colors"
              >
                Ambil Token Lain
              </button>
            </div>
          ) : (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
              <h2 className="font-semibold text-[var(--text-1)] mb-4">Ambil Nomor Antrian</h2>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Nama Pelanggan (opsional)</label>
                  <input
                    type="text"
                    value={form.customerName}
                    onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                    placeholder="Nama pelanggan"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-1)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Nomor HP (opsional)</label>
                  <input
                    type="tel"
                    value={form.customerPhone}
                    onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
                    placeholder="08xx-xxxx-xxxx"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-1)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Jenis Layanan</label>
                  <select
                    value={form.serviceType}
                    onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-1)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    {SERVICE_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1">Prioritas</label>
                  <div className="flex gap-2">
                    {(['NORMAL', 'HIGH'] as QueuePriority[]).map(p => (
                      <button
                        key={p}
                        onClick={() => setForm(f => ({ ...f, priority: p }))}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          form.priority === p
                            ? p === 'HIGH'
                              ? 'bg-orange-100 border-orange-400 text-orange-700'
                              : 'bg-[var(--primary)] border-[var(--primary)] text-white'
                            : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--bg-base)]'
                        }`}
                      >
                        {p === 'HIGH' ? '⚡ Prioritas' : '● Normal'}
                      </button>
                    ))}
                  </div>
                </div>

                {stats && (
                  <div className="p-3 bg-[var(--bg-base)] rounded-lg text-xs text-[var(--text-2)]">
                    <p>Antrean saat ini: <span className="font-semibold text-[var(--text-1)]">{stats.waiting} orang</span></p>
                    <p className="mt-0.5">Estimasi tunggu: <span className="font-semibold text-[var(--text-1)]">~{stats.estimatedWaitMinutes} menit</span></p>
                  </div>
                )}

                <button
                  onClick={takeToken}
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Memproses…' : 'Ambil Nomor Antrian'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
