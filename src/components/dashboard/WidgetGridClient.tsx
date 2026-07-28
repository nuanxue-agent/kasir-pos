'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  Star,
  Activity,
  TrendingUp,
  Clock,
  LayoutGrid,
  X,
  Eye,
  EyeOff,
  GripVertical,
  Check,
  Loader2,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export type WidgetType =
  | 'REVENUE_TODAY'
  | 'ORDERS_TODAY'
  | 'LOW_STOCK_ALERT'
  | 'TOP_PRODUCTS'
  | 'RECENT_ACTIVITY'
  | 'CASH_FLOW_MINI'
  | 'PENDING_APPROVALS'

export interface WidgetPosition {
  col: number
  row: number
}

export interface DashboardWidget {
  id: string
  storeId: string
  userId: string
  widgetType: WidgetType
  position: WidgetPosition
  config: Record<string, unknown>
  active: boolean
}

interface WidgetGridClientProps {
  storeId: string
  currency?: string
}

// ── Widget metadata ───────────────────────────────────────────────────────────

const WIDGET_META: Record<
  WidgetType,
  { label: string; icon: React.ReactNode; defaultCol: number; defaultRow: number; span?: number }
> = {
  REVENUE_TODAY: {
    label: 'Revenue Today',
    icon: <DollarSign className="h-4 w-4" />,
    defaultCol: 1,
    defaultRow: 1,
  },
  ORDERS_TODAY: {
    label: 'Orders Today',
    icon: <ShoppingCart className="h-4 w-4" />,
    defaultCol: 2,
    defaultRow: 1,
  },
  LOW_STOCK_ALERT: {
    label: 'Low Stock Alert',
    icon: <AlertTriangle className="h-4 w-4" />,
    defaultCol: 3,
    defaultRow: 1,
  },
  TOP_PRODUCTS: {
    label: 'Top Products',
    icon: <Star className="h-4 w-4" />,
    defaultCol: 1,
    defaultRow: 2,
    span: 2,
  },
  RECENT_ACTIVITY: {
    label: 'Recent Activity',
    icon: <Activity className="h-4 w-4" />,
    defaultCol: 3,
    defaultRow: 2,
  },
  CASH_FLOW_MINI: {
    label: 'Cash Flow',
    icon: <TrendingUp className="h-4 w-4" />,
    defaultCol: 1,
    defaultRow: 3,
  },
  PENDING_APPROVALS: {
    label: 'Pending Approvals',
    icon: <Clock className="h-4 w-4" />,
    defaultCol: 2,
    defaultRow: 3,
  },
}

const DEFAULT_ORDER: WidgetType[] = [
  'REVENUE_TODAY',
  'ORDERS_TODAY',
  'LOW_STOCK_ALERT',
  'TOP_PRODUCTS',
  'RECENT_ACTIVITY',
  'CASH_FLOW_MINI',
  'PENDING_APPROVALS',
]

// ── Widget content components ─────────────────────────────────────────────────

function WidgetRevenue({
  storeId,
  currency,
}: {
  storeId: string
  currency: string
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget-revenue', storeId],
    queryFn: () => {
      const d = new Date()
      const from = new Date(d)
      from.setHours(0, 0, 0, 0)
      const to = new Date(d)
      to.setHours(23, 59, 59, 999)
      return fetch(
        `/api/reports/summary?storeId=${storeId}&from=${from.toISOString()}&to=${to.toISOString()}`,
      ).then(r => r.json())
    },
    refetchInterval: 30_000,
  })
  const val = (data as any)?.totalRevenue ?? 0
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase">
        Revenue Today
      </p>
      {isLoading ? (
        <div className="h-7 w-32 animate-pulse rounded bg-[var(--bg-subtle)]" />
      ) : (
        <p className="text-2xl font-bold text-emerald-600">{formatCurrency(val, currency)}</p>
      )}
    </div>
  )
}

function WidgetOrders({ storeId }: { storeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget-orders', storeId],
    queryFn: () => {
      const d = new Date()
      const from = new Date(d)
      from.setHours(0, 0, 0, 0)
      const to = new Date(d)
      to.setHours(23, 59, 59, 999)
      return fetch(
        `/api/reports/summary?storeId=${storeId}&from=${from.toISOString()}&to=${to.toISOString()}`,
      ).then(r => r.json())
    },
    refetchInterval: 30_000,
  })
  const val = (data as any)?.totalOrders ?? 0
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase">
        Orders Today
      </p>
      {isLoading ? (
        <div className="h-7 w-16 animate-pulse rounded bg-[var(--bg-subtle)]" />
      ) : (
        <p className="text-2xl font-bold text-blue-600">{val}</p>
      )}
    </div>
  )
}

function WidgetLowStock({ storeId }: { storeId: string }) {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ['widget-low-stock', storeId],
    queryFn: () =>
      fetch(`/api/inventory?storeId=${storeId}&lowStockOnly=true`).then(r => r.json()),
    refetchInterval: 60_000,
  })
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase">
        Low Stock
      </p>
      {isLoading ? (
        <div className="h-7 w-16 animate-pulse rounded bg-[var(--bg-subtle)]" />
      ) : (
        <p className={`text-2xl font-bold ${data.length > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
          {data.length}
          <span className="ml-1.5 text-xs font-medium text-[var(--text-3)]">items</span>
        </p>
      )}
      {!isLoading && data.length > 0 && (
        <p className="text-xs text-red-500">Needs restock</p>
      )}
    </div>
  )
}

function WidgetTopProducts({
  storeId,
  currency,
}: {
  storeId: string
  currency: string
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget-top-products', storeId],
    queryFn: () => {
      const d = new Date()
      const from = new Date(d)
      from.setHours(0, 0, 0, 0)
      const to = new Date(d)
      to.setHours(23, 59, 59, 999)
      return fetch(
        `/api/reports/summary?storeId=${storeId}&from=${from.toISOString()}&to=${to.toISOString()}`,
      ).then(r => r.json())
    },
    refetchInterval: 60_000,
  })
  const products: any[] = (data as any)?.topProducts ?? []
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase">
        Top Products
      </p>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-5 animate-pulse rounded bg-[var(--bg-subtle)]" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="text-sm text-[var(--text-3)]">No sales today</p>
      ) : (
        <div className="space-y-1.5">
          {products.slice(0, 4).map((p: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-[var(--text-1)]">{p.name}</span>
              <span className="shrink-0 text-xs text-[var(--text-3)]">{p.qty}x</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WidgetRecentActivity({ storeId }: { storeId: string }) {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ['widget-recent-orders', storeId],
    queryFn: () => fetch(`/api/orders?storeId=${storeId}&limit=5`).then(r => r.json()),
    refetchInterval: 30_000,
  })
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase">
        Recent Activity
      </p>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-5 animate-pulse rounded bg-[var(--bg-subtle)]" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-[var(--text-3)]">No recent orders</p>
      ) : (
        <div className="space-y-1.5">
          {data.slice(0, 3).map((o: any) => (
            <div key={o.id} className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--text-2)]">#{String(o.id).slice(-6)}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  o.status === 'PAID'
                    ? 'bg-emerald-50 text-emerald-600'
                    : o.status === 'PENDING'
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'bg-red-50 text-red-500'
                }`}
              >
                {o.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WidgetCashFlow({
  storeId,
  currency,
}: {
  storeId: string
  currency: string
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget-cash-flow', storeId],
    queryFn: () => {
      const d = new Date()
      const from = new Date(d)
      from.setHours(0, 0, 0, 0)
      const to = new Date(d)
      to.setHours(23, 59, 59, 999)
      return fetch(
        `/api/reports/summary?storeId=${storeId}&from=${from.toISOString()}&to=${to.toISOString()}`,
      ).then(r => r.json())
    },
    refetchInterval: 60_000,
  })
  const revenue = (data as any)?.totalRevenue ?? 0
  const expenses = (data as any)?.totalExpenses ?? 0
  const net = revenue - expenses
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase">
        Cash Flow
      </p>
      {isLoading ? (
        <div className="h-7 w-28 animate-pulse rounded bg-[var(--bg-subtle)]" />
      ) : (
        <p className={`text-xl font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {formatCurrency(net, currency)}
        </p>
      )}
      <p className="text-[10px] text-[var(--text-3)]">Net today</p>
    </div>
  )
}

function WidgetPendingApprovals({ storeId }: { storeId: string }) {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ['widget-pending-approvals', storeId],
    queryFn: () =>
      fetch(`/api/purchase-orders?storeId=${storeId}&status=PENDING`).then(r =>
        r.json().then((d: any) => Array.isArray(d?.orders) ? d.orders : []).catch(() => []),
      ),
    refetchInterval: 60_000,
  })
  const count = Array.isArray(data) ? data.length : 0
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-semibold tracking-widest text-[var(--text-3)] uppercase">
        Pending Approvals
      </p>
      {isLoading ? (
        <div className="h-7 w-16 animate-pulse rounded bg-[var(--bg-subtle)]" />
      ) : (
        <p className={`text-2xl font-bold ${count > 0 ? 'text-orange-500' : 'text-emerald-600'}`}>
          {count}
        </p>
      )}
      <p className="text-[10px] text-[var(--text-3)]">purchase orders</p>
    </div>
  )
}

function WidgetContent({
  type,
  storeId,
  currency,
}: {
  type: WidgetType
  storeId: string
  currency: string
}) {
  switch (type) {
    case 'REVENUE_TODAY':
      return <WidgetRevenue storeId={storeId} currency={currency} />
    case 'ORDERS_TODAY':
      return <WidgetOrders storeId={storeId} />
    case 'LOW_STOCK_ALERT':
      return <WidgetLowStock storeId={storeId} />
    case 'TOP_PRODUCTS':
      return <WidgetTopProducts storeId={storeId} currency={currency} />
    case 'RECENT_ACTIVITY':
      return <WidgetRecentActivity storeId={storeId} />
    case 'CASH_FLOW_MINI':
      return <WidgetCashFlow storeId={storeId} currency={currency} />
    case 'PENDING_APPROVALS':
      return <WidgetPendingApprovals storeId={storeId} />
    default:
      return null
  }
}

// ── Main WidgetGridClient ─────────────────────────────────────────────────────

export default function WidgetGridClient({ storeId, currency = 'IDR' }: WidgetGridClientProps) {
  const qc = useQueryClient()
  const [customizing, setCustomizing] = useState(false)

  // Fetch saved layout
  const { data: savedWidgets, isLoading: layoutLoading } = useQuery<DashboardWidget[]>({
    queryKey: ['dashboard-widgets', storeId],
    queryFn: () =>
      fetch(`/api/dashboard-widgets?storeId=${storeId}`).then(r => r.json()),
  })

  // Build local ordered list from saved or defaults
  const buildInitial = useCallback(
    (saved: DashboardWidget[] | undefined): Array<{ type: WidgetType; active: boolean; id?: string }> => {
      if (saved && saved.length > 0) {
        const sorted = [...saved].sort((a, b) => {
          if (a.position.row !== b.position.row) return a.position.row - b.position.row
          return a.position.col - b.position.col
        })
        return sorted.map(w => ({ type: w.widgetType, active: w.active, id: w.id }))
      }
      return DEFAULT_ORDER.map(t => ({ type: t, active: true }))
    },
    [],
  )

  const [widgets, setWidgets] = useState<Array<{ type: WidgetType; active: boolean; id?: string }>>(
    () => buildInitial(undefined),
  )

  useEffect(() => {
    if (savedWidgets) setWidgets(buildInitial(savedWidgets))
  }, [savedWidgets, buildInitial])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (
      list: Array<{ type: WidgetType; active: boolean; id?: string }>,
    ) => {
      return fetch(`/api/dashboard-widgets?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          widgets: list.map((w, i) => ({
            id: w.id,
            widgetType: w.type,
            position: { col: (i % 3) + 1, row: Math.floor(i / 3) + 1 },
            active: w.active,
          })),
        }),
      }).then(r => r.json())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard-widgets', storeId] })
      setCustomizing(false)
    },
  })

  // ── Drag-and-drop via mouse events ──────────────────────────────────────────
  const dragIdx = useRef<number | null>(null)
  const dragOverIdx = useRef<number | null>(null)

  const handleDragStart = useCallback((idx: number) => {
    dragIdx.current = idx
  }, [])

  const handleDragEnter = useCallback((idx: number) => {
    dragOverIdx.current = idx
  }, [])

  const handleDrop = useCallback(() => {
    const from = dragIdx.current
    const to = dragOverIdx.current
    if (from === null || to === null || from === to) return
    setWidgets(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    dragIdx.current = null
    dragOverIdx.current = null
  }, [])

  const toggleWidget = useCallback((idx: number) => {
    setWidgets(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], active: !next[idx].active }
      return next
    })
  }, [])

  const activeWidgets = widgets.filter(w => w.active)

  if (layoutLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text-2)]">Dashboard Widgets</h2>
        {!customizing ? (
          <button
            onClick={() => setCustomizing(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] shadow-sm transition hover:bg-[var(--bg-subtle)]"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Customize Dashboard
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setWidgets(buildInitial(savedWidgets))
                setCustomizing(false)
              }}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--bg-subtle)]"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate(widgets)}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Save Layout
            </button>
          </div>
        )}
      </div>

      {/* ── Customize panel ── */}
      {customizing && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/10">
          <p className="mb-3 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
            Drag to reorder · toggle visibility
          </p>
          <div className="space-y-2">
            {widgets.map((w, idx) => {
              const meta = WIDGET_META[w.type]
              return (
                <div
                  key={w.type}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragEnter={() => handleDragEnter(idx)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                  className="flex cursor-grab items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 shadow-sm active:cursor-grabbing active:opacity-60"
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-[var(--text-3)]" />
                  <span className="text-[var(--text-2)]">{meta.icon}</span>
                  <span className="flex-1 text-sm font-medium text-[var(--text-1)]">
                    {meta.label}
                  </span>
                  <button
                    onClick={() => toggleWidget(idx)}
                    className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold transition ${
                      w.active
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-3)] hover:bg-[var(--border)]'
                    }`}
                  >
                    {w.active ? (
                      <>
                        <Eye className="h-3 w-3" /> Visible
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3" /> Hidden
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Widget grid ── */}
      {activeWidgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-10 text-center">
          <LayoutGrid className="mx-auto mb-2 h-8 w-8 text-[var(--text-3)]" />
          <p className="text-sm text-[var(--text-3)]">No widgets visible. Click &quot;Customize Dashboard&quot; to add some.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeWidgets.map(w => {
            const meta = WIDGET_META[w.type]
            const span = meta.span ?? 1
            return (
              <div
                key={w.type}
                className={`overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm transition-shadow hover:shadow-md ${
                  span === 2 ? 'sm:col-span-2' : ''
                }`}
              >
                <div className="mb-3 flex items-center gap-2 border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--text-3)]">{meta.icon}</span>
                  <span className="text-xs font-semibold tracking-wide text-[var(--text-2)]">
                    {meta.label}
                  </span>
                </div>
                <WidgetContent type={w.type} storeId={storeId} currency={currency} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
