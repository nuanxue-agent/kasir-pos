'use client'

import { useEffect, useState } from 'react'
import { Activity, Clock, Cpu, BarChart2 } from 'lucide-react'

interface ApiCall {
  url: string
  responseTime: number
  timestamp: number
}

interface MemoryInfo {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

const API_TIMES_KEY = 'perf_api_response_times'
const MAX_STORED = 20

export function storeResponseTime(url: string, responseTime: number) {
  if (typeof window === 'undefined') return
  try {
    const stored: ApiCall[] = JSON.parse(localStorage.getItem(API_TIMES_KEY) ?? '[]')
    const updated = [
      ...stored,
      { url, responseTime, timestamp: Date.now() },
    ].slice(-MAX_STORED)
    localStorage.setItem(API_TIMES_KEY, JSON.stringify(updated))
  } catch {
    // ignore
  }
}

export function parseResponseTime(headerValue: string | null | undefined): number | null {
  if (!headerValue) return null
  const ms = parseFloat(headerValue)
  return isNaN(ms) ? null : ms
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex h-full flex-col items-center gap-1">
      <div className="relative flex w-5 flex-1 items-end overflow-hidden rounded-t bg-[var(--bg-muted)]">
        <div
          className={`w-full rounded-t transition-all duration-300 ${color}`}
          style={{ height: `${pct}%` }}
        />
      </div>
      <span className="text-[9px] text-[var(--text-3)]">{value.toFixed(0)}</span>
    </div>
  )
}

export default function PerformancePage() {
  const [pageLoadTime, setPageLoadTime] = useState<number | null>(null)
  const [apiCalls, setApiCalls] = useState<ApiCall[]>([])
  const [memory, setMemory] = useState<MemoryInfo | null>(null)

  useEffect(() => {
    // Page load time from Navigation Timing API
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav) {
      setPageLoadTime(Math.round(nav.loadEventEnd - nav.startTime))
    }

    // API response times from localStorage
    try {
      const stored: ApiCall[] = JSON.parse(localStorage.getItem(API_TIMES_KEY) ?? '[]')
      setApiCalls(stored.slice(-MAX_STORED))
    } catch {
      setApiCalls([])
    }

    // Memory (Chrome only)
    const mem = (performance as unknown as { memory?: MemoryInfo }).memory
    if (mem) setMemory(mem)
  }, [])

  const avgResponseTime =
    apiCalls.length > 0
      ? apiCalls.reduce((s, c) => s + c.responseTime, 0) / apiCalls.length
      : null

  const maxResponseTime = apiCalls.length > 0 ? Math.max(...apiCalls.map(c => c.responseTime)) : 1

  const memPct =
    memory ? Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100) : null

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-1)]">Performance Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Real-time metrics for this session.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-medium text-[var(--text-2)]">Page Load</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--text-1)]">
            {pageLoadTime != null ? `${pageLoadTime}ms` : '—'}
          </p>
          {pageLoadTime != null && (
            <p
              className={`mt-0.5 text-[10px] font-medium ${
                pageLoadTime < 1000
                  ? 'text-emerald-500'
                  : pageLoadTime < 3000
                    ? 'text-amber-500'
                    : 'text-red-500'
              }`}
            >
              {pageLoadTime < 1000 ? 'Fast' : pageLoadTime < 3000 ? 'Moderate' : 'Slow'}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-violet-500" />
            <span className="text-xs font-medium text-[var(--text-2)]">Avg API</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--text-1)]">
            {avgResponseTime != null ? `${avgResponseTime.toFixed(0)}ms` : '—'}
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--text-3)]">
            {apiCalls.length} calls tracked
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-[var(--text-2)]">Max API</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--text-1)]">
            {apiCalls.length > 0 ? `${maxResponseTime.toFixed(0)}ms` : '—'}
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--text-3)]">Slowest call</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-medium text-[var(--text-2)]">Memory</span>
          </div>
          {memory ? (
            <>
              <p className="mt-2 text-2xl font-bold text-[var(--text-1)]">
                {memPct}%
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--text-3)]">
                {formatBytes(memory.usedJSHeapSize)} used
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-[var(--text-3)]">N/A</p>
          )}
        </div>
      </div>

      {/* Memory bar */}
      {memory && memPct != null && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-1)]">JS Heap Usage</h2>
          <div className="overflow-hidden rounded-full bg-[var(--bg-muted)] h-3">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                memPct < 60 ? 'bg-emerald-500' : memPct < 80 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${memPct}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-[var(--text-3)]">
            <span>{formatBytes(memory.usedJSHeapSize)} used</span>
            <span>{formatBytes(memory.jsHeapSizeLimit)} limit</span>
          </div>
        </div>
      )}

      {/* API response time chart */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <h2 className="mb-4 text-sm font-semibold text-[var(--text-1)]">
          API Response Times (last {MAX_STORED} calls)
        </h2>
        {apiCalls.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--text-3)]">
            No API calls recorded yet. Response times are stored from{' '}
            <code className="mx-1 rounded bg-[var(--bg-muted)] px-1 py-0.5 text-[10px]">
              X-Response-Time
            </code>{' '}
            headers.
          </div>
        ) : (
          <div className="flex h-32 items-end gap-1">
            {apiCalls.map((call, i) => (
              <div key={i} className="group relative flex-1" title={`${call.url}: ${call.responseTime.toFixed(0)}ms`}>
                <Bar
                  value={call.responseTime}
                  max={maxResponseTime}
                  color={
                    call.responseTime < 200
                      ? 'bg-emerald-500'
                      : call.responseTime < 500
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }
                />
                <div className="absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-stone-900 px-2 py-1 text-[10px] text-white group-hover:block z-10">
                  {call.responseTime.toFixed(0)}ms
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-4 text-[10px] text-[var(--text-3)]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> &lt;200ms
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> 200–500ms
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> &gt;500ms
          </span>
        </div>
      </div>

      {/* Recent API calls table */}
      {apiCalls.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-1)]">Recent Calls</h2>
          <div className="divide-y divide-[var(--border)]">
            {[...apiCalls].reverse().slice(0, 10).map((call, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-2">
                <span className="truncate text-xs text-[var(--text-2)]">{call.url}</span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    call.responseTime < 200
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : call.responseTime < 500
                        ? 'bg-amber-500/15 text-amber-600'
                        : 'bg-red-500/15 text-red-600'
                  }`}
                >
                  {call.responseTime.toFixed(0)}ms
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
