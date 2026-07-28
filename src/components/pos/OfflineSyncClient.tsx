'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  WifiOff,
  Wifi,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  calcSyncStats,
  isValidSyncStatusTransition,
  canRetry,
  type SyncQueueItem,
  type SyncConflict,
  type SyncStats,
} from '@/lib/offline-sync'

// Re-export pure functions for unit tests
export {
  calcSyncStats,
  isValidSyncStatusTransition,
  canRetry,
  type SyncQueueItem,
  type SyncConflict,
  type SyncStats,
} from '@/lib/offline-sync'

interface OfflineSyncClientProps {
  storeId: string
}

const ACTION_LABELS: Record<string, string> = {
  CREATE_ORDER: 'Buat Pesanan',
  UPDATE_ORDER: 'Perbarui Pesanan',
  UPDATE_STOCK: 'Perbarui Stok',
  CREATE_CUSTOMER: 'Buat Pelanggan',
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-yellow-500',
  SYNCED: 'text-green-500',
  FAILED: 'text-red-500',
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Clock className="h-4 w-4" />,
  SYNCED: <CheckCircle className="h-4 w-4" />,
  FAILED: <XCircle className="h-4 w-4" />,
}

export default function OfflineSyncClient({ storeId }: OfflineSyncClientProps) {
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [queue, setQueue] = useState<SyncQueueItem[]>([])
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [stats, setStats] = useState<SyncStats>({
    total: 0,
    pending: 0,
    synced: 0,
    failed: 0,
    pendingConflicts: 0,
  })
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [expandedConflict, setExpandedConflict] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'queue' | 'conflicts'>('queue')

  // Track online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      toast.success('Koneksi pulih — siap sinkronisasi')
    }
    const handleOffline = () => {
      setIsOnline(false)
      toast.error('Koneksi terputus — mode offline aktif')
    }
    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const fetchData = useCallback(async () => {
    const [qRes, cRes] = await Promise.all([
      fetch(`/api/sync-queue?storeId=${storeId}`),
      fetch(`/api/sync-conflicts?storeId=${storeId}`),
    ])
    if (!qRes.ok || !cRes.ok) return

    const qData = (await qRes.json()) as any[]
    const cData = (await cRes.json()) as any[]

    setQueue(qData)
    setConflicts(cData)
    setStats(calcSyncStats(qData, cData))
  }, [storeId])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleSync = async () => {
    if (!isOnline) {
      toast.error('Tidak ada koneksi internet')
      return
    }
    setIsSyncing(true)
    try {
      const res = await fetch(`/api/sync-queue/process?storeId=${storeId}`, {
        method: 'POST',
      })
      const json = (await res.json()) as any
      if (json.error) {
        toast.error(json.error)
      } else {
        toast.success(
          `Sinkronisasi selesai: ${json.synced} berhasil, ${json.failed} gagal, ${json.conflicts} konflik`,
        )
        await fetchData()
      }
    } catch {
      toast.error('Gagal menjalankan sinkronisasi')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleRetry = async (item: SyncQueueItem) => {
    if (!canRetry(item)) {
      toast.error('Item ini tidak bisa di-retry lagi')
      return
    }
    const res = await fetch(`/api/sync-queue/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PENDING' }),
    })
    const json = (await res.json()) as any
    if (json.error) {
      toast.error(json.error)
    } else {
      toast.success('Item dijadwalkan ulang')
      await fetchData()
    }
  }

  const handleResolveConflict = async (
    conflict: SyncConflict,
    resolution: 'USE_LOCAL' | 'USE_SERVER',
  ) => {
    setResolvingId(conflict.id)
    try {
      const res = await fetch(`/api/sync-conflicts/${conflict.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution }),
      })
      const json = (await res.json()) as any
      if (json.error) {
        toast.error(json.error)
      } else {
        toast.success('Konflik berhasil diselesaikan')
        setExpandedConflict(null)
        await fetchData()
      }
    } catch {
      toast.error('Gagal menyelesaikan konflik')
    } finally {
      setResolvingId(null)
    }
  }

  const pendingConflicts = conflicts.filter((c) => !c.resolved)
  const resolvedConflicts = conflicts.filter((c) => c.resolved)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
            Offline Sync
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            Kelola antrian sinkronisasi dan resolusi konflik data offline
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Online/Offline badge */}
          <div
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium',
              isOnline
                ? 'bg-green-500/10 text-green-600'
                : 'bg-red-500/10 text-red-500',
            )}
          >
            {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {isOnline ? 'Online' : 'Offline'}
          </div>
          <button
            onClick={handleSync}
            disabled={isSyncing || !isOnline || stats.pending === 0}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sinkronisasi Sekarang
          </button>
        </div>
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div
          className="flex items-center gap-3 rounded-lg border p-4"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-2)',
          }}
        >
          <WifiOff className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <p className="font-medium text-red-500">Mode Offline Aktif</p>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              Transaksi akan disimpan secara lokal dan disinkronkan otomatis saat koneksi pulih.
            </p>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total', value: stats.total, color: 'var(--text-1)' },
          { label: 'Menunggu', value: stats.pending, color: '#eab308' },
          { label: 'Tersinkron', value: stats.synced, color: '#22c55e' },
          { label: 'Gagal', value: stats.failed, color: '#ef4444' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border p-4"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              {label}
            </p>
            <p className="text-3xl font-bold mt-1" style={{ color }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Conflict alert */}
      {pendingConflicts.length > 0 && (
        <div
          className="flex items-center gap-3 rounded-lg border border-yellow-500/40 p-4"
          style={{ backgroundColor: 'var(--bg-2)' }}
        >
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>
            <span className="font-semibold text-yellow-500">{pendingConflicts.length} konflik</span>{' '}
            memerlukan resolusi manual sebelum sinkronisasi dapat dilanjutkan.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex gap-1 rounded-lg p-1"
        style={{ backgroundColor: 'var(--bg-2)' }}
      >
        {(['queue', 'conflicts'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 rounded-md py-2 text-sm font-medium transition',
              activeTab === tab
                ? 'bg-white/10 text-white shadow'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
            )}
          >
            {tab === 'queue'
              ? `Antrian Sinkronisasi (${queue.length})`
              : `Konflik (${pendingConflicts.length})`}
          </button>
        ))}
      </div>

      {/* Queue tab */}
      {activeTab === 'queue' && (
        <div className="space-y-2">
          {queue.length === 0 ? (
            <div
              className="rounded-xl border p-8 text-center"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
            >
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="font-medium" style={{ color: 'var(--text-1)' }}>
                Antrian kosong
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
                Semua data sudah tersinkronisasi dengan server.
              </p>
            </div>
          ) : (
            queue.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
              >
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn('flex items-center gap-1', STATUS_COLORS[item.status])}>
                      {STATUS_ICONS[item.status]}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--text-1)' }}>
                        {ACTION_LABELS[item.action] ?? item.action}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                        {new Date(item.createdAt).toLocaleString('id-ID')}{' '}
                        {item.retryCount > 0 && `· Retry ke-${item.retryCount}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {item.status === 'FAILED' && canRetry(item) && (
                      <button
                        onClick={() => handleRetry(item)}
                        className="rounded px-2 py-1 text-xs font-medium"
                        style={{ color: 'var(--primary)', backgroundColor: 'var(--bg-2)' }}
                      >
                        Retry
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setExpandedItem(expandedItem === item.id ? null : item.id)
                      }
                      style={{ color: 'var(--text-3)' }}
                    >
                      {expandedItem === item.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                {expandedItem === item.id && (
                  <div
                    className="border-t px-4 py-3"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-2)' }}
                  >
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-3)' }}>
                      Payload
                    </p>
                    <pre className="text-xs overflow-auto rounded p-2" style={{ color: 'var(--text-2)', backgroundColor: 'var(--bg-1)' }}>
                      {JSON.stringify(item.payload, null, 2)}
                    </pre>
                    {item.syncedAt && (
                      <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
                        Tersinkron: {new Date(item.syncedAt).toLocaleString('id-ID')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Conflicts tab */}
      {activeTab === 'conflicts' && (
        <div className="space-y-4">
          {pendingConflicts.length === 0 && resolvedConflicts.length === 0 ? (
            <div
              className="rounded-xl border p-8 text-center"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
            >
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="font-medium" style={{ color: 'var(--text-1)' }}>
                Tidak ada konflik
              </p>
            </div>
          ) : (
            <>
              {pendingConflicts.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                    Perlu Resolusi
                  </h2>
                  <div className="space-y-2">
                    {pendingConflicts.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-xl border border-yellow-500/30"
                        style={{ backgroundColor: 'var(--bg-card)' }}
                      >
                        <div className="flex items-center justify-between p-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium truncate" style={{ color: 'var(--text-1)' }}>
                                {c.conflictType.replace(/_/g, ' ')}
                              </p>
                              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                                Queue ID: {c.syncQueueId.slice(0, 8)}…
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              setExpandedConflict(expandedConflict === c.id ? null : c.id)
                            }
                            style={{ color: 'var(--text-3)' }}
                          >
                            {expandedConflict === c.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        {expandedConflict === c.id && (
                          <div
                            className="border-t p-4 space-y-4"
                            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-2)' }}
                          >
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <div>
                                <p className="text-xs font-semibold mb-1 text-blue-400">
                                  Data Lokal
                                </p>
                                <pre className="text-xs overflow-auto rounded p-2" style={{ color: 'var(--text-2)', backgroundColor: 'var(--bg-1)' }}>
                                  {JSON.stringify(c.localData, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="text-xs font-semibold mb-1 text-purple-400">
                                  Data Server
                                </p>
                                <pre className="text-xs overflow-auto rounded p-2" style={{ color: 'var(--text-2)', backgroundColor: 'var(--bg-1)' }}>
                                  {JSON.stringify(c.serverData, null, 2)}
                                </pre>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleResolveConflict(c, 'USE_LOCAL')}
                                disabled={resolvingId === c.id}
                                className="flex-1 rounded-lg py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition"
                              >
                                {resolvingId === c.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                ) : (
                                  'Pakai Data Lokal'
                                )}
                              </button>
                              <button
                                onClick={() => handleResolveConflict(c, 'USE_SERVER')}
                                disabled={resolvingId === c.id}
                                className="flex-1 rounded-lg py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition"
                              >
                                {resolvingId === c.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                ) : (
                                  'Pakai Data Server'
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {resolvedConflicts.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                    Sudah Diselesaikan ({resolvedConflicts.length})
                  </h2>
                  <div className="space-y-2">
                    {resolvedConflicts.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 rounded-xl border p-4"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
                      >
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>
                            {c.conflictType.replace(/_/g, ' ')}
                          </p>
                          {c.resolvedAt && (
                            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                              Diselesaikan:{' '}
                              {new Date(c.resolvedAt).toLocaleString('id-ID')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
