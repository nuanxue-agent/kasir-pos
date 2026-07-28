'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Sparkles, Plus, Rocket, CheckCircle2, Clock, XCircle } from 'lucide-react'
import OnboardingChecklist, {
  CHECKLIST_ITEMS,
  ONBOARDING_DISMISSED_KEY,
  readCompletionFromStorage,
  countCompleted,
  shouldAutoShow,
} from '@/components/dashboard/OnboardingChecklist'
import { formatDate } from '@/lib/utils'
import ActivityFeedClient from '@/components/dashboard/ActivityFeedClient'
import AIInsightsClient from '@/components/reports/AIInsightsClient'
import { DashboardStats } from '@/components/dashboard/DashboardStats'
import {
  DashboardCharts,
  type HourlySlot,
  type PaymentSlice,
} from '@/components/dashboard/DashboardCharts'
import { DashboardQuickActions } from '@/components/dashboard/DashboardQuickActions'
import { DashboardShiftWidget } from '@/components/dashboard/DashboardShiftWidget'

interface DashboardClientPageProps {
  storeId: string
  session: any
  modules?: string[]
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Selamat pagi'
  if (h < 17) return 'Selamat siang'
  return 'Selamat malam'
}

function todayStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
function todayEnd() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}
function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

const STATUS_STYLES: Record<string, { icon: React.ReactNode; pill: string; label: string }> = {
  PAID: {
    icon: <CheckCircle2 className="h-3 w-3" />,
    pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
    label: 'Lunas',
  },
  PENDING: {
    icon: <Clock className="h-3 w-3" />,
    pill: 'bg-[var(--bg-subtle)] text-indigo-600 border border-indigo-200',
    label: 'Pending',
  },
  VOIDED: {
    icon: <XCircle className="h-3 w-3" />,
    pill: 'bg-red-50 text-red-500 border border-red-200',
    label: 'Batal',
  },
}

export default function DashboardClientPage({
  storeId,
  session,
  modules,
}: DashboardClientPageProps) {
  const currency = session?.user?.stores?.[0]?.currency ?? 'IDR'
  const userName = session?.user?.name ?? ''
  const enabledModules = modules ?? ['pos', 'inventory', 'customers', 'discounts', 'reports']

  // ── Onboarding checklist state ───────────────────────────────────────────
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingCompleted, setOnboardingCompleted] = useState(0)
  const [onboardingDismissed, setOnboardingDismissed] = useState(true)

  useEffect(() => {
    const dismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true'
    setOnboardingDismissed(dismissed)
    setOnboardingCompleted(countCompleted(readCompletionFromStorage()))
    if (shouldAutoShow()) {
      setShowOnboarding(true)
    }
  }, [])

  const remainingCount = CHECKLIST_ITEMS.length - onboardingCompleted
  const allDone = remainingCount <= 0

  // Active shift
  const { data: shiftData, isLoading: shiftLoading } = useQuery({
    queryKey: ['shift-current', storeId],
    queryFn: () => fetch(`/api/shifts?storeId=${storeId}&active=true`).then(r => r.json()),
    refetchInterval: 30_000,
  })
  const activeShift = (shiftData as any) ?? null

  // Live indicator
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [secondsAgo, setSecondsAgo] = useState(0)

  useEffect(() => {
    if (!lastUpdated) return
    const id = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [lastUpdated])

  // NPS — current month average
  const currentMonthStart = (() => {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  })()
  const { data: npsData } = useQuery<{ avgNps: number | null; totalResponses: number }>({
    queryKey: ['dashboard-nps', storeId, currentMonthStart.slice(0, 7)],
    queryFn: () =>
      fetch(`/api/surveys?storeId=${storeId}`)
        .then(r => r.json())
        .then(async (surveys: unknown) => {
          const surveyList = (surveys as any[]) ?? []
          if (!surveyList.length) return { avgNps: null, totalResponses: 0 }
          const analyticsResults = await Promise.allSettled(
            surveyList.map((s: any) =>
              fetch(`/api/surveys/${s.id}/analytics?storeId=${storeId}`).then(r => r.json()),
            ),
          )
          let npsSum = 0,
            npsCount = 0,
            totalResponses = 0
          for (const r of analyticsResults) {
            if (r.status === 'fulfilled') {
              const a = r.value as any
              totalResponses += a.totalResponses ?? 0
              if (a.avgNps !== null && a.avgNps !== undefined) {
                npsSum += a.avgNps
                npsCount++
              }
            }
          }
          return {
            avgNps: npsCount > 0 ? Math.round((npsSum / npsCount) * 10) / 10 : null,
            totalResponses,
          }
        }),
    refetchInterval: 120_000,
  })

  // Today's summary
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary', storeId],
    queryFn: () =>
      fetch(`/api/reports/summary?storeId=${storeId}&from=${todayStart()}&to=${todayEnd()}`).then(
        r => r.json(),
      ),
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (data !== undefined) {
      setLastUpdated(new Date())
      setSecondsAgo(0)
    }
  }, [data])

  // Yesterday
  const { data: yesterday } = useQuery({
    queryKey: ['dashboard-summary-yesterday', storeId],
    queryFn: () => {
      const y = new Date()
      y.setDate(y.getDate() - 1)
      const ys = new Date(y)
      ys.setHours(0, 0, 0, 0)
      const ye = new Date(y)
      ye.setHours(23, 59, 59, 999)
      return fetch(
        `/api/reports/summary?storeId=${storeId}&from=${ys.toISOString()}&to=${ye.toISOString()}`,
      ).then(r => r.json())
    },
  })

  // 7-day trend
  const { data: weekData } = useQuery({
    queryKey: ['dashboard-week', storeId],
    queryFn: () =>
      fetch(`/api/reports/summary?storeId=${storeId}&from=${daysAgo(6)}&to=${todayEnd()}`).then(r =>
        r.json(),
      ),
  })

  // Recent orders
  const { data: recentOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders-recent', storeId],
    queryFn: () => fetch(`/api/orders?storeId=${storeId}&limit=8`).then(r => r.json()),
  })

  // Low stock
  const { data: lowStock = [], isLoading: stockLoading } = useQuery({
    queryKey: ['inventory-low', storeId],
    queryFn: () => fetch(`/api/inventory?storeId=${storeId}&lowStockOnly=true`).then(r => r.json()),
  })

  // Hourly today
  const todayDate = new Date().toISOString().slice(0, 10)
  const { data: hourlyToday = [] } = useQuery<HourlySlot[]>({
    queryKey: ['hourly-today', storeId, todayDate],
    queryFn: () =>
      fetch(`/api/reports/hourly?storeId=${storeId}&date=${todayDate}`).then(r => r.json()),
  })

  // Hourly yesterday
  const yesterdayDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })()
  const { data: hourlyYesterday = [] } = useQuery<HourlySlot[]>({
    queryKey: ['hourly-yesterday', storeId, yesterdayDate],
    queryFn: () =>
      fetch(`/api/reports/hourly?storeId=${storeId}&date=${yesterdayDate}`).then(r => r.json()),
  })

  const stats = (data as any) ?? {}
  const yStats = (yesterday as any) ?? {}

  const topProducts = (data as any)?.topProducts ?? []
  const paymentBreakdown: PaymentSlice[] = (data as any)?.paymentBreakdown ?? []

  const sparkRevenue: number[] = Array.isArray((weekData as any)?.dailySales)
    ? (weekData as any).dailySales.map((d: any) => d.total ?? 0)
    : []

  const dateLabel = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-5 sm:px-6 sm:py-8">
      {/* ── Greeting ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            <span className="text-[11px] font-semibold tracking-widest text-indigo-600 capitalize uppercase dark:text-indigo-400">
              {dateLabel}
            </span>
            <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
            {lastUpdated && (
              <span className="text-[10px] text-[var(--text-3)]">Updated {secondsAgo}s ago</span>
            )}
          </div>
          <h1 className="text-xl font-bold text-[var(--text-1)] sm:text-2xl">
            {getGreeting()}
            {userName ? `, ${userName.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">Ini ringkasan tokomu hari ini.</p>
        </div>
        <Link
          href="/dashboard/pos"
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:-translate-y-0.5 hover:shadow-indigo-300 active:scale-95 dark:shadow-indigo-900/40"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Catat Penjualan</span>
          <span className="sm:hidden">Jual</span>
        </Link>
        {!allDone && !onboardingDismissed && (
          <button
            onClick={() => setShowOnboarding(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-700 transition-all hover:bg-indigo-100 active:scale-95 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400"
          >
            <Rocket className="h-4 w-4" />
            <span className="hidden sm:inline">Getting Started ({remainingCount} left)</span>
            <span className="sm:hidden">{remainingCount}</span>
          </button>
        )}
      </div>

      {/* ── Shift status widget ── */}
      <DashboardShiftWidget
        shiftLoading={shiftLoading}
        activeShift={activeShift}
        currency={currency}
        totalRevenue={stats.totalRevenue ?? 0}
      />

      {/* ── Stats + KPI + NPS ── */}
      <DashboardStats
        storeId={storeId}
        currency={currency}
        stats={stats}
        yStats={yStats}
        isLoading={isLoading}
        topProducts={topProducts}
        sparkRevenue={sparkRevenue}
        npsData={npsData}
      />

      {/* ── Quick actions ── */}
      <DashboardQuickActions />

      {/* ── Charts, orders, stock ── */}
      <DashboardCharts
        currency={currency}
        sparkRevenue={sparkRevenue}
        hourlyToday={hourlyToday as HourlySlot[]}
        hourlyYesterday={hourlyYesterday as HourlySlot[]}
        paymentBreakdown={paymentBreakdown}
        topProducts={topProducts}
        recentOrders={recentOrders as any[]}
        lowStock={lowStock as any[]}
        ordersLoading={ordersLoading}
        stockLoading={stockLoading}
        statusStyles={STATUS_STYLES}
        formatDate={formatDate}
      />

      {/* ── Smart Insights ── */}
      <AIInsightsClient storeId={storeId} compact />

      {/* ── Activity Feed ── */}
      <ActivityFeedClient storeId={storeId} />

      {/* ── Bottom padding for mobile nav ── */}
      <div className="h-4 lg:h-0" />

      {/* ── Onboarding Checklist panel ── */}
      <OnboardingChecklist
        open={showOnboarding}
        onClose={() => {
          setShowOnboarding(false)
          setOnboardingCompleted(countCompleted(readCompletionFromStorage()))
          setOnboardingDismissed(localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true')
        }}
      />
    </div>
  )
}
