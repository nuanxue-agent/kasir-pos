'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  LayoutGrid,
  Star,
  StarOff,
  Copy,
  Loader2,
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  ClipboardList,
  Target,
  Smile,
  MessageSquare,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'
import {
  WidgetType,
  WidgetSize,
  LayoutWidget,
  DashboardLayout,
  validateWidget,
  moveWidgetUp,
  moveWidgetDown,
  buildDefaultWidgets,
  serializeWidgets,
} from '@/lib/custom-dashboard'

// Re-export pure functions for unit testing
export {
  validateWidget,
  moveWidgetUp,
  moveWidgetDown,
  serializeWidgets,
  buildDefaultWidgets,
} from '@/lib/custom-dashboard'
export {
  deserializeWidgets,
  selectDefaultLayout,
  copyLayout,
  isValidWidgetType,
  isValidPosition,
  isValidSize,
} from '@/lib/custom-dashboard'

// ── Constants ─────────────────────────────────────────────────────────────────

const WIDGET_META: Record<WidgetType, { label: string; icon: React.ReactNode; description: string }> = {
  REVENUE_CHART:   { label: 'Revenue Chart',    icon: <TrendingUp className="h-4 w-4" />,     description: 'Daily/weekly revenue trend' },
  TOP_PRODUCTS:    { label: 'Top Products',      icon: <ShoppingBag className="h-4 w-4" />,    description: 'Best-selling items by revenue' },
  LOW_STOCK:       { label: 'Low Stock',         icon: <AlertTriangle className="h-4 w-4" />,  description: 'Products below reorder threshold' },
  RECENT_ORDERS:   { label: 'Recent Orders',     icon: <ClipboardList className="h-4 w-4" />,  description: 'Latest transactions' },
  KPI_CARD:        { label: 'KPI Card',          icon: <Target className="h-4 w-4" />,         description: 'Key performance indicator' },
  NPS_SCORE:       { label: 'NPS Score',         icon: <Smile className="h-4 w-4" />,          description: 'Net Promoter Score gauge' },
  COMPLAINT_COUNT: { label: 'Complaint Count',   icon: <MessageSquare className="h-4 w-4" />,  description: 'Open complaint tickets' },
  QUEUE_STATUS:    { label: 'Queue Status',      icon: <Users className="h-4 w-4" />,          description: 'Live service queue' },
}

const SIZE_OPTIONS: { value: WidgetSize; label: string }[] = [
  { value: 'small',  label: 'Small'  },
  { value: 'medium', label: 'Medium' },
  { value: 'large',  label: 'Large'  },
]

const ALL_WIDGET_TYPES = Object.keys(WIDGET_META) as WidgetType[]

// ── Props ─────────────────────────────────────────────────────────────────────

interface CustomDashboardClientProps {
  storeId: string
  userId: string
  initialLayouts: DashboardLayout[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CustomDashboardClient({
  storeId,
  userId,
  initialLayouts,
}: CustomDashboardClientProps) {
  const [layouts, setLayouts] = useState<DashboardLayout[]>(initialLayouts)
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(
    initialLayouts.find(l => l.isDefault)?.id ?? initialLayouts[0]?.id ?? null,
  )
  const [widgets, setWidgets] = useState<LayoutWidget[]>(() => {
    const active = initialLayouts.find(l => l.isDefault) ?? initialLayouts[0]
    return active?.widgets ?? buildDefaultWidgets()
  })
  const [layoutName, setLayoutName] = useState<string>(() => {
    const active = initialLayouts.find(l => l.isDefault) ?? initialLayouts[0]
    return active?.name ?? 'My Dashboard'
  })
  const [saving, setSaving] = useState(false)
  const [newLayoutName, setNewLayoutName] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [addingWidget, setAddingWidget] = useState(false)
  const [newWidgetType, setNewWidgetType] = useState<WidgetType>('REVENUE_CHART')
  const [newWidgetSize, setNewWidgetSize] = useState<WidgetSize>('medium')

  // Load a layout into the editor
  const loadLayout = useCallback((layout: DashboardLayout) => {
    setActiveLayoutId(layout.id)
    setWidgets(layout.widgets)
    setLayoutName(layout.name)
  }, [])

  // Fetch layouts from API
  const fetchLayouts = useCallback(async () => {
    const res = await fetch(`/api/dashboard-layouts?storeId=${storeId}`)
    const json = await res.json() as any
    if (Array.isArray(json)) setLayouts(json)
  }, [storeId])

  // Save current layout (create new if no activeLayoutId)
  const saveLayout = useCallback(async () => {
    if (!layoutName.trim()) { toast.error('Layout name is required'); return }
    setSaving(true)
    try {
      if (activeLayoutId) {
        // Update existing
        const res = await fetch(`/api/dashboard-layouts/${activeLayoutId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: layoutName, widgets }),
        })
        const json = await res.json() as any
        if (json.error) { toast.error(json.error); return }
        toast.success('Layout saved')
        await fetchLayouts()
      } else {
        // Create first layout
        const res = await fetch(`/api/dashboard-layouts?storeId=${storeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: layoutName, widgets, isDefault: true }),
        })
        const json = await res.json() as any
        if (json.error) { toast.error(json.error); return }
        setActiveLayoutId(json.id)
        toast.success('Layout created')
        await fetchLayouts()
      }
    } finally {
      setSaving(false)
    }
  }, [activeLayoutId, layoutName, widgets, storeId, fetchLayouts])

  // Create a new layout
  const createLayout = useCallback(async () => {
    if (!newLayoutName.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/dashboard-layouts?storeId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newLayoutName.trim(), widgets: buildDefaultWidgets(), isDefault: false }),
      })
      const json = await res.json() as any
      if (json.error) { toast.error(json.error); return }
      toast.success('Layout created')
      setNewLayoutName('')
      setShowNewForm(false)
      await fetchLayouts()
    } finally {
      setSaving(false)
    }
  }, [newLayoutName, storeId, fetchLayouts])

  // Set a layout as default
  const setAsDefault = useCallback(async (id: string) => {
    const res = await fetch(`/api/dashboard-layouts/${id}/default`, { method: 'POST' })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success('Default layout updated')
    await fetchLayouts()
  }, [fetchLayouts])

  // Delete a layout
  const deleteLayout = useCallback(async (id: string) => {
    const res = await fetch(`/api/dashboard-layouts/${id}`, { method: 'DELETE' })
    const json = await res.json() as any
    if (json.error) { toast.error(json.error); return }
    toast.success('Layout deleted')
    if (activeLayoutId === id) {
      setActiveLayoutId(null)
      setWidgets(buildDefaultWidgets())
      setLayoutName('My Dashboard')
    }
    await fetchLayouts()
  }, [activeLayoutId, fetchLayouts])

  // Widget ordering
  const handleMoveUp = (idx: number) => setWidgets(w => moveWidgetUp(w, idx))
  const handleMoveDown = (idx: number) => setWidgets(w => moveWidgetDown(w, idx))

  // Remove widget
  const removeWidget = (idx: number) => {
    setWidgets(prev => prev.filter((_, i) => i !== idx))
  }

  // Add widget
  const addWidget = () => {
    const exists = widgets.some(w => w.type === newWidgetType)
    if (exists) { toast.error('Widget already added'); return }
    const newWidget: LayoutWidget = {
      type: newWidgetType,
      position: { col: widgets.length % 3, row: Math.floor(widgets.length / 3) },
      size: newWidgetSize,
      config: {},
    }
    setWidgets(prev => [...prev, newWidget])
    setAddingWidget(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-6 w-6 text-[var(--primary)]" />
          <h1 className="text-2xl font-bold text-[var(--text-1)]">Custom Dashboard</h1>
        </div>
        <button
          onClick={saveLayout}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Layout
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left panel — Saved layouts */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-2)]">Saved Layouts</h2>
            <button
              onClick={() => setShowNewForm(v => !v)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--primary)] hover:bg-[var(--bg-2)]"
            >
              <Plus className="h-3 w-3" /> New
            </button>
          </div>

          {showNewForm && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 space-y-2">
              <input
                type="text"
                value={newLayoutName}
                onChange={e => setNewLayoutName(e.target.value)}
                placeholder="Layout name…"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1.5 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                onKeyDown={e => { if (e.key === 'Enter') createLayout() }}
              />
              <div className="flex gap-2">
                <button
                  onClick={createLayout}
                  disabled={saving}
                  className="flex-1 rounded-md bg-[var(--primary)] py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  onClick={() => { setShowNewForm(false); setNewLayoutName('') }}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--bg-2)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {layouts.length === 0 && (
            <p className="text-sm text-[var(--text-3)] italic">No saved layouts yet</p>
          )}

          {layouts.map(layout => (
            <div
              key={layout.id}
              className={cn(
                'group flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                activeLayoutId === layout.id
                  ? 'border-[var(--primary)] bg-[var(--bg-2)]'
                  : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-2)]',
              )}
              onClick={() => loadLayout(layout)}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--text-1)]">{layout.name}</p>
                <p className="text-xs text-[var(--text-3)]">{layout.widgets.length} widgets</p>
              </div>
              <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  title={layout.isDefault ? 'Default layout' : 'Set as default'}
                  onClick={e => { e.stopPropagation(); setAsDefault(layout.id) }}
                  className="rounded p-1 hover:bg-[var(--bg-1)]"
                >
                  {layout.isDefault
                    ? <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                    : <StarOff className="h-3.5 w-3.5 text-[var(--text-3)]" />}
                </button>
                <button
                  title="Delete layout"
                  onClick={e => { e.stopPropagation(); deleteLayout(layout.id) }}
                  className="rounded p-1 hover:bg-[var(--bg-1)]"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Right panel — Widget editor */}
        <div className="space-y-4 lg:col-span-2">
          {/* Layout name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Layout Name</label>
            <input
              type="text"
              value={layoutName}
              onChange={e => setLayoutName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="Layout name…"
            />
          </div>

          {/* Widget list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-2)]">
                Widgets ({widgets.length})
              </h2>
              <button
                onClick={() => setAddingWidget(v => !v)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--primary)] hover:bg-[var(--bg-2)]"
              >
                <Plus className="h-3 w-3" /> Add Widget
              </button>
            </div>

            {/* Add widget form */}
            {addingWidget && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-[var(--text-2)]">Widget Type</label>
                    <select
                      value={newWidgetType}
                      onChange={e => setNewWidgetType(e.target.value as WidgetType)}
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-1)] px-2 py-1.5 text-sm text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    >
                      {ALL_WIDGET_TYPES.map(t => (
                        <option key={t} value={t}>{WIDGET_META[t].label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--text-2)]">Size</label>
                    <select
                      value={newWidgetSize}
                      onChange={e => setNewWidgetSize(e.target.value as WidgetSize)}
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-1)] px-2 py-1.5 text-sm text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    >
                      {SIZE_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-3)]">{WIDGET_META[newWidgetType].description}</p>
                <div className="flex gap-2">
                  <button
                    onClick={addWidget}
                    className="flex-1 rounded-md bg-[var(--primary)] py-1.5 text-xs font-medium text-white"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAddingWidget(false)}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--bg-2)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {widgets.length === 0 && (
              <p className="rounded-lg border border-dashed border-[var(--border)] py-8 text-center text-sm text-[var(--text-3)]">
                No widgets — click "Add Widget" to get started
              </p>
            )}

            {widgets.map((widget, idx) => {
              const meta = WIDGET_META[widget.type]
              return (
                <div
                  key={`${widget.type}-${idx}`}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2"
                >
                  {/* Icon + info */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-2)] text-[var(--primary)]">
                    {meta.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--text-1)]">{meta.label}</p>
                    <p className="text-xs text-[var(--text-3)] capitalize">{widget.size} · col {widget.position.col}, row {widget.position.row}</p>
                  </div>

                  {/* Size picker */}
                  <select
                    value={widget.size}
                    onChange={e => {
                      const size = e.target.value as WidgetSize
                      setWidgets(prev => prev.map((w, i) => i === idx ? { ...w, size } : w))
                    }}
                    className="rounded border border-[var(--border)] bg-[var(--bg-1)] px-2 py-1 text-xs text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  >
                    {SIZE_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>

                  {/* Up/Down */}
                  <div className="flex flex-col">
                    <button
                      onClick={() => handleMoveUp(idx)}
                      disabled={idx === 0}
                      className="rounded p-0.5 hover:bg-[var(--bg-2)] disabled:opacity-30"
                      title="Move up"
                    >
                      <ChevronUp className="h-3.5 w-3.5 text-[var(--text-2)]" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(idx)}
                      disabled={idx === widgets.length - 1}
                      className="rounded p-0.5 hover:bg-[var(--bg-2)] disabled:opacity-30"
                      title="Move down"
                    >
                      <ChevronDown className="h-3.5 w-3.5 text-[var(--text-2)]" />
                    </button>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeWidget(idx)}
                    className="rounded p-1 hover:bg-[var(--bg-2)]"
                    title="Remove widget"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Preview grid hint */}
          {widgets.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">Layout Preview</h3>
              <div className="grid grid-cols-3 gap-2">
                {widgets.map((widget, idx) => (
                  <div
                    key={`preview-${idx}`}
                    className={cn(
                      'rounded-md border border-[var(--border)] bg-[var(--bg-2)] p-2 text-center',
                      widget.size === 'large' && 'col-span-3',
                      widget.size === 'medium' && 'col-span-2',
                      widget.size === 'small' && 'col-span-1',
                    )}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[var(--primary)]">{WIDGET_META[widget.type].icon}</span>
                      <span className="text-xs text-[var(--text-2)]">{WIDGET_META[widget.type].label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
