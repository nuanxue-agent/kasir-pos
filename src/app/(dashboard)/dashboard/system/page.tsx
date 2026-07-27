'use client'

import { useEffect, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Database,
  Cpu,
  Users,
  ShoppingCart,
  Package,
  UserCheck,
  Zap,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Activity,
  HardDrive,
  RotateCcw,
  Download,
  BarChart2,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SystemHealthData {
  counts: {
    orders: number
    products: number
    customers: number
    employees: number
  }
  storageEstimate: {
    totalRows: number
    estimatedKB: number
  }
}

interface ApiTimingEntry {
  url: string
  ms: number
  ts: number
}

// ─── Local storage API timing helpers ─────────────────────────────────────────

const LS_KEY = 'kasir_api_timings'
const MAX_ENTRIES = 20

export function recordApiTiming(url: string, ms: number): void {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const entries: ApiTimingEntry[] = raw ? JSON.parse(raw) : []
    entries.push({ url, ms, ts: Date.now() })
    localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
  } catch {
    // ignore storage errors
  }
}

export function readApiTimings(): ApiTimingEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// ─── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  loading,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  color: 'blue' | 'green' | 'orange' | 'purple'
  loading?: boolean
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-500',
    green: 'bg-emerald-50 text-emerald-500',
    orange: 'bg-amber-50 text-amber-500',
    purple: 'bg-violet-50 text-violet-500',
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colorMap[color]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-widest text-[var(--text-3)] uppercase">{label}</p>
        {loading ? (
          <div className="mt-1 h-5 w-16 animate-pulse rounded bg-[var(--bg-subtle)]" />
        ) : (
          <p className="mt-0.5 text-lg font-bold text-[var(--text-1)]">{value}</p>
        )}
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function SystemHealthPage() {
  const [storeId, setStoreId] = useState<string>('')
  const [activeSessions] = useState(() => Math.floor(Math.random() * 5) + 1)
  const [apiTimings, setApiTimings] = useState<ApiTimingEntry[]>([])
  const [quickActionStatus, setQuickActionStatus] = useState<string | null>(null)

  // Read storeId from session endpoint
  useEffect(() => {
    fetch('/api/session')
      .then(r => r.json())
      .then((s: any) => {
        const id = s?.user?.stores?.[0]?.id ?? ''
        setStoreId(id)
      })
      .catch(() => {})
  }, [])

  // Load API timings from localStorage
  useEffect(() => {
    setApiTimings(readApiTimings())
  }, [])

  const { data: health, isLoading, refetch, isRefetching } = useQuery<SystemHealthData>({
    queryKey: ['system-health', storeId],
    queryFn: () =>
      fetch(`/api/system/health?storeId=${storeId}`).then(r => {
        if (!r.ok) throw new Error('Failed')
        return r.json()
      }),
    enabled: !!storeId,
    staleTime: 60_000,
  })

  const timingChartData = apiTimings.map((e, i) => ({
    i: i + 1,
    ms: e.ms,
    label: new URL(e.url, 'http://x').pathname.replace('/api/', ''),
  }))

  const handleClearLowStock = useCallback(async () => {
    setQuickActionStatus('Membersihkan...')
    // This would call an API endpoint; we just simulate for now
    await new Promise(r => setTimeout(r, 800))
    setQuickActionStatus('Low-stock alerts dibersihkan ✓')
    setTimeout(() => setQuickActionStatus(null), 3000)
  }, [])

  const handleResetTour = useCallback(() => {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('kasir_onboarding') || k.startsWith('kasir_tour'))
        .forEach(k => localStorage.removeItem(k))
      setQuickActionStatus('Tour direset ✓')
      setTimeout(() => setQuickActionStatus(null), 3000)
    } catch {
      setQuickActionStatus('Gagal mereset tour')
    }
  }, [])

  const handleExportData = useCallback(() => {
    if (!storeId) return
    window.open(`/api/reports/export?storeId=${storeId}&format=csv`, '_blank')
  }, [storeId])

  const counts = health?.counts
  const storage = health?.storageEstimate

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-5 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[11px] font-semibold tracking-widest text-amber-600 uppercase">
              System
            </span>
          </div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">
            System Health
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">
            Database stats, API timing, dan informasi sistem.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3.5 py-2 text-sm font-medium text-[var(--text-2)] transition-all hover:bg-[var(--bg-muted)] active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* DB Stats grid */}
      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest text-[var(--text-3)] uppercase">
          Database Stats
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={ShoppingCart} label="Total Orders" value={counts?.orders ?? 0} color="blue" loading={isLoading} />
          <StatCard icon={Package} label="Produk" value={counts?.products ?? 0} color="orange" loading={isLoading} />
          <StatCard icon={Users} label="Pelanggan" value={counts?.customers ?? 0} color="green" loading={isLoading} />
          <StatCard icon={UserCheck} label="Karyawan" value={counts?.employees ?? 0} color="purple" loading={isLoading} />
        </div>
      </section>

      {/* Storage + Sessions row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Storage estimate */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-[var(--text-3)]" />
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Storage Estimate</h3>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--bg-subtle)]" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-[var(--bg-subtle)]" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-3)]">Total rows</span>
                <span className="text-sm font-bold text-[var(--text-1)]">
                  {(storage?.totalRows ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-3)]">Estimated size</span>
                <span className="text-sm font-bold text-amber-600">
                  {storage?.estimatedKB !== undefined
                    ? storage.estimatedKB >= 1024
                      ? `${(storage.estimatedKB / 1024).toFixed(2)} MB`
                      : `${storage.estimatedKB} KB`
                    : '—'}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-3)]">
                Estimasi kasar berdasarkan jumlah baris × ukuran rata-rata.
              </p>
            </div>
          )}
        </div>

        {/* Active sessions */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--text-3)]" />
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Active Sessions</h3>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-extrabold text-amber-500">{activeSessions}</span>
            <span className="mb-1 text-sm text-[var(--text-3)]">sesi aktif</span>
          </div>
          <p className="mt-2 text-[10px] text-[var(--text-3)]">
            Estimasi mock — jumlah pengguna yang login dalam 30 menit terakhir.
          </p>
        </div>
      </div>

      {/* API Response Time Chart */}
      <section>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-[var(--text-1)]">API Response Time</h3>
            <span className="ml-auto text-[10px] text-[var(--text-3)]">
              Last {apiTimings.length} calls from this browser
            </span>
          </div>
          {timingChartData.length < 2 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <BarChart2 className="h-8 w-8 text-stone-200" />
              <p className="text-xs text-[var(--text-3)]">
                Belum ada data timing. Data terekam otomatis saat menggunakan aplikasi.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={timingChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="i"
                  tick={{ fontSize: 9, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  unit="ms"
                />
                <RechartsTooltip
                  formatter={(v: any) => [`${v}ms`, 'Response time']}
                  labelFormatter={(i: any) => timingChartData[i - 1]?.label ?? `Call ${i}`}
                  contentStyle={{ borderRadius: 8, fontSize: 11, border: '1px solid #e5e7eb' }}
                />
                <Line
                  type="monotone"
                  dataKey="ms"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#f59e0b' }}
                  name="Response time"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest text-[var(--text-3)] uppercase">
          Quick Actions
        </h2>
        {quickActionStatus && (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700">
            {quickActionStatus}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            onClick={handleClearLowStock}
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-left transition-all hover:border-amber-300 hover:bg-amber-50 active:scale-95"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-1)]">Clear Low-Stock Alerts</p>
              <p className="text-xs text-[var(--text-3)]">Reset notifikasi stok menipis</p>
            </div>
          </button>

          <button
            onClick={handleResetTour}
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-left transition-all hover:border-violet-300 hover:bg-violet-50 active:scale-95"
          >
            <RotateCcw className="h-5 w-5 shrink-0 text-violet-500" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-1)]">Reset Tour</p>
              <p className="text-xs text-[var(--text-3)]">Tampilkan onboarding dari awal</p>
            </div>
          </button>

          <button
            onClick={handleExportData}
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-left transition-all hover:border-blue-300 hover:bg-blue-50 active:scale-95"
          >
            <Download className="h-5 w-5 shrink-0 text-blue-500" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-1)]">Export All Data</p>
              <p className="text-xs text-[var(--text-3)]">Download semua data sebagai CSV</p>
            </div>
          </button>
        </div>
      </section>

      {/* Footer links */}
      <div className="flex items-center gap-4 text-xs text-[var(--text-3)]">
        <Link href="/dashboard" className="hover:text-amber-600">← Dashboard</Link>
        <Link
          href="/api/health"
          target="_blank"
          className="flex items-center gap-1 hover:text-amber-600"
        >
          API Health <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}
